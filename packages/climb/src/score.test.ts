import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyGate, runScore } from "./score.ts";
import { parseJudgeScore, SCORE_CATEGORIES, type JudgeScore, type ScoreCategory } from "./score-schema.ts";

function judgeScore({ judge, brief, all, overrides = {} }: { judge: string; brief: string; all: number; overrides?: Partial<Record<ScoreCategory, number>> }): JudgeScore {
  const scores = Object.fromEntries(SCORE_CATEGORIES.map((category) => [category, overrides[category] ?? all])) as JudgeScore["scores"];
  return { judge, brief, scores, findings: [] };
}

const briefs = ["a", "b", "c", "d"];

describe("applyGate", () => {
  test("passes when every mean is at least 9.5 and no score is below 9", () => {
    const scores = [
      judgeScore({ judge: "j1", brief: "a", all: 10 }),
      judgeScore({ judge: "j1", brief: "b", all: 9 }),
      judgeScore({ judge: "j1", brief: "c", all: 10 }),
      judgeScore({ judge: "j1", brief: "d", all: 10 }),
    ];
    const gate = applyGate({ judges: ["j1"], briefs, scores });
    expect(gate.failures).toEqual([]);
    expect(gate.pass).toBe(true);
  });

  test("fails a category whose mean is below 9.5 even when no single score is below 9", () => {
    const scores = briefs.map((brief) => judgeScore({ judge: "j1", brief, all: 10, overrides: { readability: 9 } }));
    const gate = applyGate({ judges: ["j1"], briefs, scores });
    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([{ kind: "mean", judge: "j1", category: "readability", mean: 9 }]);
  });

  test("fails one diagram below 9 even when the category mean passes", () => {
    const scores = [
      ...["a", "b", "c"].map((brief) => judgeScore({ judge: "j1", brief, all: 10 })),
      judgeScore({ judge: "j1", brief: "d", all: 10, overrides: { craft: 8 } }),
    ];
    const gate = applyGate({ judges: ["j1"], briefs, scores });
    expect(gate.stats.find((stats) => stats.category === "craft")?.mean).toBe(9.5);
    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([{ kind: "low", judge: "j1", category: "craft", brief: "d", score: 8 }]);
  });

  test("fails a judge that did not score every brief in the set", () => {
    const scores = ["a", "b", "c"].map((brief) => judgeScore({ judge: "j1", brief, all: 10 }));
    const gate = applyGate({ judges: ["j1"], briefs, scores });
    expect(gate.failures).toEqual([{ kind: "missing", judge: "j1", brief: "d" }]);
  });

  test("gates each judge on its own scores", () => {
    const scores = [
      ...briefs.map((brief) => judgeScore({ judge: "j1", brief, all: 10 })),
      ...briefs.map((brief) => judgeScore({ judge: "j2", brief, all: 9 })),
    ];
    const gate = applyGate({ judges: ["j1", "j2"], briefs, scores });
    expect(gate.pass).toBe(false);
    expect(new Set(gate.failures.map((failure) => failure.judge))).toEqual(new Set(["j2"]));
    expect(gate.failures).toHaveLength(SCORE_CATEGORIES.length);
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
    const result = await runScore({ scoreDirs: [join(root, "r1"), join(root, "r2")], set: "climb", judges: ["j1"], out: join(root, "out") });
    expect(result.gate.pass).toBe(true);
    const table = await readFile(join(root, "out/table.md"), "utf8");
    expect(table).toContain("| Judge | Category | r1 | r2 |");
    expect(table).toContain("| j1 | craft | 7.00 (min 7) | 10.00 (min 10) |");
    expect(table).toContain("| **Gate** | | **FAIL** (18) | **PASS** |");
  });
});
