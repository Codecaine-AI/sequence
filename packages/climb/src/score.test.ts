import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyGate, describeFailure, parseFloorExemption, runScore, type Draw } from "./score.ts";
import { parseJudgeScore, SCORE_CATEGORIES, type JudgeScore, type ScoreCategory } from "./score-schema.ts";

function judgeScore({ judge, brief, all, overrides = {} }: { judge: string; brief: string; all: number; overrides?: Partial<Record<ScoreCategory, number>> }): JudgeScore {
  const scores = Object.fromEntries(SCORE_CATEGORIES.map((category) => [category, overrides[category] ?? all])) as JudgeScore["scores"];
  return { judge, brief, scores, findings: [] };
}

const briefs = ["a", "b", "c", "d"];

/** A round of one draw, gated as such. */
const oneDraw = (scores: JudgeScore[]) => ({ draws: [{ label: "draw-1", scores }], requiredDraws: 1 });

/** Three draws of `judge`: every brief scores 10 in every category, except the craft scores given for `brief`. */
function threeDraws({ judge = "j1", brief, craft }: { judge?: string; brief: string; craft: [number, number, number] }): Draw[] {
  return craft.map((value, index) => ({
    label: `draw-${index + 1}`,
    scores: briefs.map((name) => judgeScore({ judge, brief: name, all: 10, overrides: name === brief ? { craft: value } : {} })),
  }));
}

describe("applyGate", () => {
  test("passes when every mean is at least 9.5 and no score is below 9", () => {
    const scores = [
      judgeScore({ judge: "j1", brief: "a", all: 10 }),
      judgeScore({ judge: "j1", brief: "b", all: 9 }),
      judgeScore({ judge: "j1", brief: "c", all: 10 }),
      judgeScore({ judge: "j1", brief: "d", all: 10 }),
    ];
    const gate = applyGate({ judges: ["j1"], briefs, ...oneDraw(scores) });
    expect(gate.failures).toEqual([]);
    expect(gate.pass).toBe(true);
  });

  test("fails a category whose mean is below 9.5 even when no single score is below 9", () => {
    const scores = briefs.map((brief) => judgeScore({ judge: "j1", brief, all: 10, overrides: { readability: 9 } }));
    const gate = applyGate({ judges: ["j1"], briefs, ...oneDraw(scores) });
    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([{ kind: "mean", judge: "j1", category: "readability", mean: 9 }]);
  });

  test("fails one diagram below 9 even when the category mean passes", () => {
    const scores = [
      ...["a", "b", "c"].map((brief) => judgeScore({ judge: "j1", brief, all: 10 })),
      judgeScore({ judge: "j1", brief: "d", all: 10, overrides: { craft: 8 } }),
    ];
    const gate = applyGate({ judges: ["j1"], briefs, ...oneDraw(scores) });
    expect(gate.stats.find((stats) => stats.category === "craft")?.mean).toBe(9.5);
    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([{ kind: "low", judge: "j1", category: "craft", brief: "d", mean: 8, scores: [8] }]);
  });

  test("fails a judge that did not score every brief in the set", () => {
    const scores = ["a", "b", "c"].map((brief) => judgeScore({ judge: "j1", brief, all: 10 }));
    const gate = applyGate({ judges: ["j1"], briefs, ...oneDraw(scores) });
    expect(gate.failures).toEqual([{ kind: "missing", judge: "j1", brief: "d", draw: "draw-1" }]);
  });

  test("gates each judge on its own scores", () => {
    const scores = [
      ...briefs.map((brief) => judgeScore({ judge: "j1", brief, all: 10 })),
      ...briefs.map((brief) => judgeScore({ judge: "j2", brief, all: 9 })),
    ];
    const gate = applyGate({ judges: ["j1", "j2"], briefs, ...oneDraw(scores) });
    expect(gate.pass).toBe(false);
    expect(new Set(gate.failures.map((failure) => ("judge" in failure ? failure.judge : undefined)))).toEqual(new Set(["j2"]));
    expect(gate.failures).toHaveLength(SCORE_CATEGORIES.length);
  });
});

describe("applyGate over draws", () => {
  test("a brief whose draws are 10, 10, 7 has a mean of 9.0 and passes the floor", () => {
    const gate = applyGate({ judges: ["j1"], briefs, draws: threeDraws({ brief: "d", craft: [10, 10, 7] }) });
    expect(gate.failures).toEqual([]);
    const craft = gate.stats.find((stats) => stats.category === "craft");
    expect(craft?.min).toBe(9);
    // Brief d spreads 3 over its draws, the other three briefs 0.
    expect(craft?.spread).toBe(0.75);
  });

  test("a brief whose draws are 9, 9, 8 has a mean of 8.67 and fails the floor", () => {
    const gate = applyGate({ judges: ["j1"], briefs, draws: threeDraws({ brief: "d", craft: [9, 9, 8] }) });
    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([{ kind: "low", judge: "j1", category: "craft", brief: "d", mean: 26 / 3, scores: [9, 9, 8] }]);
    expect(describeFailure(gate.failures[0]!)).toBe("j1 / craft / d: mean 8.67 of draws 9, 9, 8 is below 9");
  });

  test("a set mean of exactly 9.5 over draws passes", () => {
    // Brief means 29/3 and 28/3 and two 9.5s: the set mean is exactly 9.5.
    const draws = [0, 1, 2].map((index) => ({
      label: `draw-${index + 1}`,
      scores: [
        judgeScore({ judge: "j1", brief: "a", all: 10, overrides: { craft: [10, 10, 9][index] } }),
        judgeScore({ judge: "j1", brief: "b", all: 10, overrides: { craft: [10, 9, 9][index] } }),
        judgeScore({ judge: "j1", brief: "c", all: 10, overrides: { craft: [10, 9, 9][index] } }),
        judgeScore({ judge: "j1", brief: "d", all: 10, overrides: { craft: [10, 10, 9][index] } }),
      ],
    }));
    const gate = applyGate({ judges: ["j1"], briefs, draws });
    expect(gate.stats.find((stats) => stats.category === "craft")?.mean).toBeCloseTo(9.5, 12);
    expect(gate.failures).toEqual([]);
  });

  test("a missing draw for one judge fails the gate and the brief is not averaged over the other draws", () => {
    const draws = threeDraws({ brief: "d", craft: [10, 10, 1] });
    const withoutD = { ...draws[2]!, scores: draws[2]!.scores.filter((score) => score.brief !== "d") };
    const gate = applyGate({ judges: ["j1"], briefs, draws: [draws[0]!, draws[1]!, withoutD] });
    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([{ kind: "missing", judge: "j1", brief: "d", draw: "draw-3" }]);
    expect(gate.stats.find((stats) => stats.category === "craft")?.count).toBe(3);
  });

  test("a round with fewer draws than the gate needs fails", () => {
    const gate = applyGate({ judges: ["j1"], briefs, draws: threeDraws({ brief: "d", craft: [10, 10, 10] }).slice(0, 2) });
    expect(gate.failures).toEqual([{ kind: "draws", expected: 3, actual: 2 }]);
  });
});

describe("applyGate with --exempt-floor", () => {
  test("an exempt cell below 9 does not trip the floor, and the round passes", () => {
    // Brief d scores 8 in craft in every draw. With a, b, c at 10 the craft mean is exactly 9.5.
    const draws = threeDraws({ brief: "d", craft: [8, 8, 8] });
    const without = applyGate({ judges: ["j1"], briefs, draws });
    expect(without.failures).toEqual([{ kind: "low", judge: "j1", category: "craft", brief: "d", mean: 8, scores: [8, 8, 8] }]);
    const gate = applyGate({ judges: ["j1"], briefs, draws, exemptFloor: [{ brief: "d", category: "craft" }] });
    expect(gate.failures).toEqual([]);
    expect(gate.pass).toBe(true);
    const craft = gate.stats.find((stats) => stats.category === "craft")!;
    expect(craft.min).toBe(10);
    expect(craft.exempt).toEqual([{ brief: "d", mean: 8 }]);
  });

  test("an exempt cell still counts in the 9.5 mean", () => {
    // Brief d scores 7 in craft: the craft mean is (10 + 10 + 10 + 7) / 4 = 9.25, so the mean fails even though the floor is exempt.
    const draws = threeDraws({ brief: "d", craft: [7, 7, 7] });
    const gate = applyGate({ judges: ["j1"], briefs, draws, exemptFloor: [{ brief: "d", category: "craft" }] });
    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([{ kind: "mean", judge: "j1", category: "craft", mean: 9.25 }]);
    expect(gate.stats.find((stats) => stats.category === "craft")?.mean).toBe(9.25);
    expect(gate.stats.find((stats) => stats.category === "craft")?.count).toBe(4);
  });

  test("the exemption covers one category of one brief, for every judge", () => {
    const draws: Draw[] = [1, 2, 3].map((n) => ({
      label: `draw-${n}`,
      scores: ["j1", "j2"].flatMap((judge) => briefs.map((brief) => judgeScore({ judge, brief, all: 10, overrides: brief === "d" ? { craft: 8, readability: 8 } : {} }))),
    }));
    const gate = applyGate({ judges: ["j1", "j2"], briefs, draws, exemptFloor: [{ brief: "d", category: "craft" }] });
    // Readability on d still trips the floor for both judges. Craft on d trips it for neither.
    expect(gate.failures).toEqual([
      { kind: "low", judge: "j1", category: "readability", brief: "d", mean: 8, scores: [8, 8, 8] },
      { kind: "low", judge: "j2", category: "readability", brief: "d", mean: 8, scores: [8, 8, 8] },
    ]);
  });

  test("parses <brief>:<category> and refuses an unknown category", () => {
    expect(parseFloorExemption("status-poll:participantOrder")).toEqual({ brief: "status-poll", category: "participantOrder" });
    expect(() => parseFloorExemption("status-poll:order")).toThrow(/unknown category "order"/);
    expect(() => parseFloorExemption("status-poll")).toThrow(/<brief>:<category>/);
  });
});

describe("parseJudgeScore", () => {
  test("refuses a score outside 1-10, a fractional score and a missing category", () => {
    const base = judgeScore({ judge: "j1", brief: "a", all: 10 });
    expect(parseJudgeScore(base).ok).toBe(true);
    expect(parseJudgeScore({ ...base, scores: { ...base.scores, craft: 11 } }).ok).toBe(false);
    expect(parseJudgeScore({ ...base, scores: { ...base.scores, craft: 9.5 } }).ok).toBe(false);
    const { craft: _craft, ...missing } = base.scores;
    expect(parseJudgeScore({ ...base, scores: missing }).ok).toBe(false);
  });
});

describe("runScore", () => {
  test("writes a table with a column per round and gates the newest round", async () => {
    const root = await mkdtemp(join(tmpdir(), "climb-score-"));
    const write = async (round: string, score: JudgeScore) => {
      await mkdir(join(root, round, score.judge), { recursive: true });
      await writeFile(join(root, round, score.judge, `${score.brief}.json`), JSON.stringify(score));
    };
    await write("r1", judgeScore({ judge: "j1", brief: "a", all: 7 }));
    await write("r2", judgeScore({ judge: "j1", brief: "a", all: 10 }));
    const result = await runScore({ rounds: [join(root, "r1"), join(root, "r2")], set: "climb", judges: ["j1"], out: join(root, "out"), draws: 1 });
    expect(result.gate.pass).toBe(true);
    const table = await readFile(join(root, "out/table.md"), "utf8");
    expect(table).toContain("| Judge | Category | r1 (1 draw) | r2 (1 draw) |");
    expect(table).toContain("| j1 | craft | 7.00 (min 7) | 10.00 (min 10) |");
    expect(table).toContain("| **Gate** | | **FAIL** (18) | **PASS** |");
  });

  test("reads a climb round folder as one round of draws, and a comma list as another", async () => {
    const root = await mkdtemp(join(tmpdir(), "climb-score-"));
    const write = async (scoresDir: string, score: JudgeScore) => {
      await mkdir(join(root, scoresDir, score.judge), { recursive: true });
      await writeFile(join(root, scoresDir, score.judge, `${score.brief}.json`), JSON.stringify(score));
    };
    for (const [index, craft] of [10, 10, 7].entries()) await write(`round/draw-${index + 1}/scores`, judgeScore({ judge: "j1", brief: "a", all: 10, overrides: { craft } }));
    for (const [index, craft] of [9, 9, 8].entries()) await write(`old-${index + 1}/scores`, judgeScore({ judge: "j1", brief: "a", all: 10, overrides: { craft } }));
    const old = [1, 2, 3].map((n) => join(root, `old-${n}/scores`)).join(",");
    const result = await runScore({ rounds: [old, join(root, "round")], set: "climb", judges: ["j1"], out: join(root, "out") });
    // Brief a's 9.0 clears the floor, but a one-brief set mean of 9.0 is below 9.5.
    expect(result.gate.failures).toEqual([{ kind: "mean", judge: "j1", category: "craft", mean: 9 }]);
    const table = await readFile(join(root, "out/table.md"), "utf8");
    expect(table).toContain("| Judge | Category | old-1 + old-2 + old-3 (3 draws) | round (3 draws) |");
    expect(table).toContain("| j1 | craft | 8.67 (min 8.67, spread 1.00) | 9.00 (min 9, spread 3.00) |");
    expect(table).toContain("| **Gate** | | **FAIL** (2) | **FAIL** (1) |");
  });

  test("prints exempt cells in the table and gate.json, and refuses an exempt brief outside the set", async () => {
    const root = await mkdtemp(join(tmpdir(), "climb-score-"));
    const write = async (scoresDir: string, score: JudgeScore) => {
      await mkdir(join(root, scoresDir, score.judge), { recursive: true });
      await writeFile(join(root, scoresDir, score.judge, `${score.brief}.json`), JSON.stringify(score));
    };
    for (const [index, craft] of [8, 7, 8].entries()) {
      await write(`round/draw-${index + 1}/scores`, judgeScore({ judge: "j1", brief: "a", all: 10, overrides: { craft } }));
      await write(`round/draw-${index + 1}/scores`, judgeScore({ judge: "j1", brief: "b", all: 10 }));
    }
    const input = { rounds: [join(root, "round")], set: "climb" as const, judges: ["j1"], out: join(root, "out") };
    const without = await runScore(input);
    expect(without.gate.failures.map(describeFailure)).toEqual(["j1 / craft: mean 8.83 is below 9.5", "j1 / craft / a: mean 7.67 of draws 8, 7, 8 is below 9"]);
    const result = await runScore({ ...input, exemptFloor: [{ brief: "a", category: "craft" }] });
    // The floor failure is gone. The mean still includes a's 7.67 and still fails.
    expect(result.gate.failures.map(describeFailure)).toEqual(["j1 / craft: mean 8.83 is below 9.5"]);
    const table = await readFile(join(root, "out/table.md"), "utf8");
    expect(table).toContain("Exempt from the floor for every judge, still in the mean: a / craft.");
    expect(table).toContain("| j1 | craft | 8.83 (min 10, spread 0.50, exempt a 7.67) |");
    expect(table).toContain("| j1 | readability | 10.00 (min 10, spread 0.00) |");
    const gate = JSON.parse(await readFile(join(root, "out/gate.json"), "utf8"));
    expect(gate.exemptFloor).toEqual(["a:craft"]);
    await expect(runScore({ ...input, exemptFloor: [{ brief: "zzz", category: "craft" }] })).rejects.toThrow(/brief "zzz" is not in the set \(a, b\)/);
  });
});
