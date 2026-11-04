import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { parseJudgeScore, SCORE_CATEGORIES, type JudgeScore, type ScoreCategory } from "./score-schema.ts";

/** The gate: per judge and category, the set's mean is at least MIN_MEAN and no diagram is below MIN_SCORE. */
export const GATE = { minMean: 9.5, minScore: 9 } as const;

export const BRIEF_SETS = ["climb", "held-out"] as const;
export type BriefSet = (typeof BRIEF_SETS)[number];

export type GateFailure =
  | { kind: "missing"; judge: string; brief: string }
  | { kind: "mean"; judge: string; category: ScoreCategory; mean: number }
  | { kind: "low"; judge: string; category: ScoreCategory; brief: string; score: number };

export interface CategoryStats {
  judge: string;
  category: ScoreCategory;
  /** Undefined when the judge scored none of the set's briefs. */
  mean: number | undefined;
  min: number | undefined;
  count: number;
}

export interface GateResult {
  pass: boolean;
  failures: GateFailure[];
  stats: CategoryStats[];
}

/** Apply the gate to one round of scores for the given judges and briefs. */
export function applyGate({ judges, briefs, scores }: { judges: readonly string[]; briefs: readonly string[]; scores: readonly JudgeScore[] }): GateResult {
  const failures: GateFailure[] = [];
  const stats: CategoryStats[] = [];
  const inSet = new Set(briefs);
  for (const judge of judges) {
    const byBrief = new Map(scores.filter((score) => score.judge === judge && inSet.has(score.brief)).map((score) => [score.brief, score]));
    for (const brief of briefs) {
      if (!byBrief.has(brief)) failures.push({ kind: "missing", judge, brief });
    }
    const judged = [...byBrief.values()];
    for (const category of SCORE_CATEGORIES) {
      const values = judged.map((score) => score.scores[category]);
      const mean = values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
      const min = values.length === 0 ? undefined : Math.min(...values);
      stats.push({ judge, category, mean, min, count: values.length });
      if (mean !== undefined && mean < GATE.minMean) failures.push({ kind: "mean", judge, category, mean });
      for (const score of judged) {
        const value = score.scores[category];
        if (value < GATE.minScore) failures.push({ kind: "low", judge, category, brief: score.brief, score: value });
      }
    }
  }
  return { pass: failures.length === 0, failures, stats };
}

export function describeFailure(failure: GateFailure): string {
  switch (failure.kind) {
    case "missing":
      return `${failure.judge}: no score for brief ${failure.brief}`;
    case "mean":
      return `${failure.judge} / ${failure.category}: mean ${failure.mean.toFixed(2)} is below ${GATE.minMean}`;
    case "low":
      return `${failure.judge} / ${failure.category} / ${failure.brief}: score ${failure.score} is below ${GATE.minScore}`;
    default: {
      const _exhaustive: never = failure;
      return _exhaustive;
    }
  }
}

/** One --scores folder, read and validated. */
export interface ScoreRound {
  label: string;
  dir: string;
  scores: JudgeScore[];
}

/** Read `<dir>/<judge>/<brief>.json` for every judge. Any invalid file throws with every problem listed. */
export async function loadScoreRound({ dir, judges }: { dir: string; judges: readonly string[] }): Promise<ScoreRound> {
  const root = resolve(dir);
  const scores: JudgeScore[] = [];
  const problems: string[] = [];
  for (const judge of judges) {
    const judgeDir = join(root, judge);
    let files: string[];
    try {
      files = (await readdir(judgeDir)).filter((file) => file.endsWith(".json")).sort();
    } catch {
      problems.push(`${judgeDir}: folder missing`);
      continue;
    }
    for (const file of files) {
      const path = join(judgeDir, file);
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(path, "utf8"));
      } catch (error) {
        problems.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const parsed = parseJudgeScore(raw);
      if (!parsed.ok) {
        problems.push(...parsed.errors.map((error) => `${path}: ${error}`));
        continue;
      }
      const brief = basename(file, ".json");
      if (parsed.score.judge !== judge) problems.push(`${path}: judge is ${JSON.stringify(parsed.score.judge)}, folder says ${JSON.stringify(judge)}`);
      if (parsed.score.brief !== brief) problems.push(`${path}: brief is ${JSON.stringify(parsed.score.brief)}, file name says ${JSON.stringify(brief)}`);
      scores.push(parsed.score);
    }
  }
  if (problems.length > 0) throw new Error(`Invalid score files:\n${problems.join("\n")}`);
  // Rounds usually keep scores in <round>/scores: name the column after the round.
  const label = basename(root) === "scores" ? basename(dirname(root)) : basename(root);
  return { label, dir: root, scores };
}

const formatCell = (stats: CategoryStats | undefined): string =>
  stats?.mean === undefined || stats.min === undefined ? "–" : `${stats.mean.toFixed(2)} (min ${stats.min})`;

/** Markdown table: one row per judge and category, one column per round, then a gate row. */
export function renderTable({ set, judges, rounds }: { set: BriefSet; judges: readonly string[]; rounds: readonly { label: string; gate: GateResult }[] }): string {
  const header = `| Judge | Category | ${rounds.map((round) => round.label).join(" | ")} |`;
  const divider = `|---|---|${rounds.map(() => "---|").join("")}`;
  const rows: string[] = [];
  for (const judge of judges) {
    for (const category of SCORE_CATEGORIES) {
      const cells = rounds.map((round) => formatCell(round.gate.stats.find((stats) => stats.judge === judge && stats.category === category)));
      rows.push(`| ${judge} | ${category} | ${cells.join(" | ")} |`);
    }
  }
  rows.push(`| **Gate** | | ${rounds.map((round) => (round.gate.pass ? "**PASS**" : `**FAIL** (${round.gate.failures.length})`)).join(" | ")} |`);
  return [
    `Set: \`${set}\`. Cells show the mean over the set's briefs, then the lowest single score.`,
    `Gate: every judge and category has a mean of at least ${GATE.minMean}, and no diagram scores below ${GATE.minScore}.`,
    "",
    header,
    divider,
    ...rows,
    "",
  ].join("\n");
}

/** The set's briefs: the folders of --briefs when given, else every brief any judge scored in the newest round. */
async function setBriefs({ briefsDir, round }: { briefsDir: string | undefined; round: ScoreRound }): Promise<string[]> {
  if (briefsDir === undefined) return [...new Set(round.scores.map((score) => score.brief))].sort();
  const entries = await readdir(resolve(briefsDir), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export interface ScoreCommandInput {
  scoreDirs: readonly string[];
  set: BriefSet;
  judges: readonly string[];
  out: string;
  briefsDir?: string;
}

/** Gate the newest --scores round, write table.md and gate.json, and return the newest verdict. */
export async function runScore(input: ScoreCommandInput): Promise<{ gate: GateResult; table: string; briefs: string[] }> {
  const loaded = await Promise.all(input.scoreDirs.map((dir) => loadScoreRound({ dir, judges: input.judges })));
  const labels = loaded.map((round) => round.label);
  const rounds = loaded.map((round, index) => ({
    ...round,
    label: labels.indexOf(round.label) === index && labels.lastIndexOf(round.label) === index ? round.label : `${index + 1}: ${round.label}`,
  }));
  const newest = rounds.at(-1);
  if (newest === undefined) throw new Error("Give at least one --scores folder.");
  const briefs = await setBriefs({ briefsDir: input.briefsDir, round: newest });
  if (briefs.length === 0) throw new Error("The set has no briefs.");
  const gated = rounds.map((round) => ({ label: round.label, gate: applyGate({ judges: input.judges, briefs, scores: round.scores }) }));
  const table = renderTable({ set: input.set, judges: input.judges, rounds: gated });
  const last = gated.at(-1);
  if (last === undefined) throw new Error("Give at least one --scores folder.");
  const gate = last.gate;
  const out = resolve(input.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "table.md"), table);
  await writeFile(
    join(out, "gate.json"),
    `${JSON.stringify({ set: input.set, judges: input.judges, briefs, round: newest.dir, pass: gate.pass, failures: gate.failures.map(describeFailure) }, null, 2)}\n`,
  );
  return { gate, table, briefs };
}
