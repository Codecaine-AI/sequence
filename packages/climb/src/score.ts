import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { parseJudgeScore, SCORE_CATEGORIES, type JudgeScore, type ScoreCategory } from "./score-schema.ts";

/**
 * The gate, per judge and category. A brief's score is the mean over the round's draws.
 * The set's mean must be at least minMean, no brief may be below minScore,
 * and the round must have exactly `draws` draws.
 */
export const GATE = { minMean: 9.5, minScore: 9, draws: 3 } as const;

export const BRIEF_SETS = ["climb", "held-out"] as const;
export type BriefSet = (typeof BRIEF_SETS)[number];

/** A (brief, category) cell the floor skips for every judge. It still counts in the set mean. */
export interface FloorExemption {
  brief: string;
  category: ScoreCategory;
}

const isScoreCategory = (value: string): value is ScoreCategory => (SCORE_CATEGORIES as readonly string[]).includes(value);

/** Parse one `--exempt-floor` value, `<brief>:<category>`. */
export function parseFloorExemption(value: string): FloorExemption {
  const colon = value.lastIndexOf(":");
  if (colon <= 0 || colon === value.length - 1) throw new Error(`--exempt-floor needs <brief>:<category>, got ${JSON.stringify(value)}`);
  const brief = value.slice(0, colon);
  const category = value.slice(colon + 1);
  if (!isScoreCategory(category)) throw new Error(`--exempt-floor: unknown category ${JSON.stringify(category)}; known: ${SCORE_CATEGORIES.join(", ")}`);
  return { brief, category };
}

export type GateFailure =
  | { kind: "draws"; expected: number; actual: number }
  | { kind: "missing"; judge: string; brief: string; draw: string }
  | { kind: "mean"; judge: string; category: ScoreCategory; mean: number }
  | { kind: "low"; judge: string; category: ScoreCategory; brief: string; mean: number; scores: number[] };

export interface CategoryStats {
  judge: string;
  category: ScoreCategory;
  /** Mean over briefs of each brief's draw mean. Undefined when no brief has a score in every draw. */
  mean: number | undefined;
  /** The lowest draw mean among the briefs the floor checks. Undefined when every brief is exempt. */
  min: number | undefined;
  /** Briefs exempt from the floor in this category, with their draw means. They are in `mean`. */
  exempt: { brief: string; mean: number }[];
  /** Max minus min over draws, averaged over briefs. */
  spread: number | undefined;
  /** Briefs with a score in every draw. */
  count: number;
}

export interface GateResult {
  pass: boolean;
  failures: GateFailure[];
  stats: CategoryStats[];
}

/** One draw of a round: every brief drawn once, and each judge's scores for those diagrams. */
export interface Draw {
  label: string;
  scores: readonly JudgeScore[];
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/**
 * Apply the gate to one round. A brief counts only when the judge scored it in every draw;
 * a missing draw is a failure, never a mean over the draws that remain.
 */
export function applyGate({
  judges,
  briefs,
  draws,
  requiredDraws = GATE.draws,
  exemptFloor = [],
}: {
  judges: readonly string[];
  briefs: readonly string[];
  draws: readonly Draw[];
  requiredDraws?: number;
  /** Cells the floor skips, for every judge. Each still counts in its category's mean. */
  exemptFloor?: readonly FloorExemption[];
}): GateResult {
  const failures: GateFailure[] = [];
  const stats: CategoryStats[] = [];
  if (draws.length !== requiredDraws) failures.push({ kind: "draws", expected: requiredDraws, actual: draws.length });
  for (const judge of judges) {
    const byDraw = draws.map((draw) => new Map(draw.scores.filter((score) => score.judge === judge).map((score) => [score.brief, score])));
    // brief -> its score file in each draw, kept only when every draw has one.
    const complete = new Map<string, JudgeScore[]>();
    for (const brief of briefs) {
      const perDraw = byDraw.map((scores) => scores.get(brief));
      perDraw.forEach((score, index) => {
        if (score === undefined) failures.push({ kind: "missing", judge, brief, draw: draws[index]!.label });
      });
      if (perDraw.length > 0 && perDraw.every((score) => score !== undefined)) complete.set(brief, perDraw as JudgeScore[]);
    }
    for (const category of SCORE_CATEGORIES) {
      const exempt = new Set(exemptFloor.filter((cell) => cell.category === category).map((cell) => cell.brief));
      const perBrief = [...complete].map(([brief, scores]) => ({ brief, values: scores.map((score) => score.scores[category]) }));
      const briefMean = (entry: { values: number[] }): number => sum(entry.values) / entry.values.length;
      // The mean and spread take every brief. The floor takes only the briefs that are not exempt.
      const total = sum(perBrief.flatMap((entry) => entry.values));
      const count = perBrief.length * draws.length;
      const mean = count === 0 ? undefined : total / count;
      const floored = perBrief.filter((entry) => !exempt.has(entry.brief));
      stats.push({
        judge,
        category,
        mean,
        min: floored.length === 0 ? undefined : Math.min(...floored.map(briefMean)),
        exempt: perBrief.filter((entry) => exempt.has(entry.brief)).map((entry) => ({ brief: entry.brief, mean: briefMean(entry) })),
        spread: perBrief.length === 0 ? undefined : sum(perBrief.map((entry) => Math.max(...entry.values) - Math.min(...entry.values))) / perBrief.length,
        count: perBrief.length,
      });
      // Every brief has the same number of draws, so the mean of brief means is total / count.
      // Compare integer sums so a mean of exactly 9.5 or 9 never loses to rounding.
      if (mean !== undefined && total < GATE.minMean * count) failures.push({ kind: "mean", judge, category, mean });
      for (const entry of floored) {
        if (sum(entry.values) < GATE.minScore * entry.values.length) {
          failures.push({ kind: "low", judge, category, brief: entry.brief, mean: sum(entry.values) / entry.values.length, scores: entry.values });
        }
      }
    }
  }
  return { pass: failures.length === 0, failures, stats };
}

/** A whole number as is, anything else with two decimals. */
const formatNumber = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

export function describeFailure(failure: GateFailure): string {
  switch (failure.kind) {
    case "draws":
      return `the round has ${failure.actual} draw${failure.actual === 1 ? "" : "s"}, the gate needs ${failure.expected}`;
    case "missing":
      return `${failure.judge}: no score for brief ${failure.brief} in ${failure.draw}`;
    case "mean":
      return `${failure.judge} / ${failure.category}: mean ${failure.mean.toFixed(2)} is below ${GATE.minMean}`;
    case "low":
      return failure.scores.length === 1
        ? `${failure.judge} / ${failure.category} / ${failure.brief}: score ${failure.mean} is below ${GATE.minScore}`
        : `${failure.judge} / ${failure.category} / ${failure.brief}: mean ${formatNumber(failure.mean)} of draws ${failure.scores.join(", ")} is below ${GATE.minScore}`;
    default: {
      const _exhaustive: never = failure;
      return _exhaustive;
    }
  }
}

/** One table column: a round of one or more draws, read and validated. */
export interface ScoreRound {
  label: string;
  draws: (Draw & { dir: string })[];
}

/** Rounds usually keep scores in <round>/scores: name a scores folder after its round. */
const folderLabel = (dir: string): string => (basename(dir) === "scores" ? basename(dirname(dir)) : basename(dir));

/** Read `<dir>/<judge>/<brief>.json` for every judge. Any invalid file throws with every problem listed. */
export async function loadDraw({ dir, judges }: { dir: string; judges: readonly string[] }): Promise<Draw & { dir: string }> {
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
  return { label: folderLabel(root), dir: root, scores };
}

/** `draw-<n>` folders, the layout `climb round` writes. */
const DRAW_FOLDER = /^draw-(\d+)$/;

/** The score folders of a `climb round` folder, in draw order. Empty when `dir` is not one. */
async function roundDrawDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const draws = entries
    .filter((entry) => entry.isDirectory() && DRAW_FOLDER.test(entry.name))
    .map((entry) => ({ name: entry.name, n: Number(DRAW_FOLDER.exec(entry.name)![1]) }))
    .sort((a, b) => a.n - b.n);
  const dirs: string[] = [];
  for (const draw of draws) {
    const scores = join(dir, draw.name, "scores");
    if (!(await stat(scores).catch(() => undefined))?.isDirectory()) throw new Error(`${join(dir, draw.name)} has no scores folder. Run climb judge for that draw.`);
    dirs.push(scores);
  }
  return dirs;
}

/**
 * One `--scores` value is one round. It is a `climb round` folder (its draw-<n>/scores folders are the draws),
 * a comma list of score folders (one draw each), or one score folder (a round of one draw).
 */
export async function loadScoreRound({ spec, judges }: { spec: string; judges: readonly string[] }): Promise<ScoreRound> {
  const parts = spec.split(",").map((part) => resolve(part.trim())).filter((part) => part.length > 0);
  if (parts.length === 1) {
    const drawDirs = await roundDrawDirs(parts[0]!);
    if (drawDirs.length > 0) {
      const draws = await Promise.all(drawDirs.map((dir) => loadDraw({ dir, judges })));
      return { label: basename(parts[0]!), draws: draws.map((draw, index) => ({ ...draw, label: basename(dirname(drawDirs[index]!)) })) };
    }
  }
  const draws = await Promise.all(parts.map((dir) => loadDraw({ dir, judges })));
  return { label: draws.map((draw) => draw.label).join(" + "), draws };
}

const formatCell = (stats: CategoryStats | undefined, draws: number): string => {
  if (stats?.mean === undefined || stats.spread === undefined) return "–";
  const parts = [
    ...(stats.min === undefined ? [] : [`min ${formatNumber(stats.min)}`]),
    ...(draws > 1 ? [`spread ${stats.spread.toFixed(2)}`] : []),
    ...stats.exempt.map((cell) => `exempt ${cell.brief} ${formatNumber(cell.mean)}`),
  ];
  return `${stats.mean.toFixed(2)} (${parts.join(", ")})`;
};

/** Markdown table: one row per judge and category, one column per round, then a gate row. */
export function renderTable({
  set,
  judges,
  rounds,
  exemptFloor = [],
}: {
  set: BriefSet;
  judges: readonly string[];
  rounds: readonly { label: string; draws: number; gate: GateResult }[];
  exemptFloor?: readonly FloorExemption[];
}): string {
  const header = `| Judge | Category | ${rounds.map((round) => `${round.label} (${round.draws} draw${round.draws === 1 ? "" : "s"})`).join(" | ")} |`;
  const divider = `|---|---|${rounds.map(() => "---|").join("")}`;
  const rows: string[] = [];
  for (const judge of judges) {
    for (const category of SCORE_CATEGORIES) {
      const cells = rounds.map((round) => formatCell(round.gate.stats.find((stats) => stats.judge === judge && stats.category === category), round.draws));
      rows.push(`| ${judge} | ${category} | ${cells.join(" | ")} |`);
    }
  }
  rows.push(`| **Gate** | | ${rounds.map((round) => (round.gate.pass ? "**PASS**" : `**FAIL** (${round.gate.failures.length})`)).join(" | ")} |`);
  return [
    `Set: \`${set}\`. A brief's score is its mean over the round's draws.`,
    "Cells show the mean over the set's briefs, then the lowest brief the floor checks, then the spread (max minus min over draws, averaged over briefs).",
    `Gate: every judge and category has a mean of at least ${GATE.minMean}, and no brief is below ${GATE.minScore}.`,
    ...(exemptFloor.length === 0
      ? []
      : [`Exempt from the floor for every judge, still in the mean: ${exemptFloor.map((cell) => `${cell.brief} / ${cell.category}`).join(", ")}. A cell shows each exempt brief's mean after \`exempt\`.`]),
    "",
    header,
    divider,
    ...rows,
    "",
  ].join("\n");
}

/** The set's briefs: the folders of --briefs when given, else every brief any judge scored in the newest round. */
async function setBriefs({ briefsDir, round }: { briefsDir: string | undefined; round: ScoreRound }): Promise<string[]> {
  if (briefsDir === undefined) return [...new Set(round.draws.flatMap((draw) => draw.scores.map((score) => score.brief)))].sort();
  const entries = await readdir(resolve(briefsDir), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export interface ScoreCommandInput {
  /** One entry per round, oldest first. See loadScoreRound. */
  rounds: readonly string[];
  set: BriefSet;
  judges: readonly string[];
  out: string;
  briefsDir?: string;
  /** Draws the newest round must have. Defaults to GATE.draws. */
  draws?: number;
  /** Cells the floor skips for every judge. Each brief must be in the set. */
  exemptFloor?: readonly FloorExemption[];
}

/** Gate every round, write table.md and gate.json, and return the newest round's verdict. */
export async function runScore(input: ScoreCommandInput): Promise<{ gate: GateResult; table: string; briefs: string[] }> {
  const loaded = await Promise.all(input.rounds.map((spec) => loadScoreRound({ spec, judges: input.judges })));
  const labels = loaded.map((round) => round.label);
  const rounds = loaded.map((round, index) => ({
    ...round,
    label: labels.indexOf(round.label) === index && labels.lastIndexOf(round.label) === index ? round.label : `${index + 1}: ${round.label}`,
  }));
  const newest = rounds.at(-1);
  if (newest === undefined) throw new Error("Give at least one --scores round.");
  const briefs = await setBriefs({ briefsDir: input.briefsDir, round: newest });
  if (briefs.length === 0) throw new Error("The set has no briefs.");
  const requiredDraws = input.draws ?? GATE.draws;
  const exemptFloor = input.exemptFloor ?? [];
  for (const cell of exemptFloor) {
    if (!briefs.includes(cell.brief)) throw new Error(`--exempt-floor: brief ${JSON.stringify(cell.brief)} is not in the set (${briefs.join(", ")})`);
  }
  const gated = rounds.map((round) => ({
    label: round.label,
    draws: round.draws.length,
    gate: applyGate({ judges: input.judges, briefs, draws: round.draws, requiredDraws, exemptFloor }),
  }));
  const table = renderTable({ set: input.set, judges: input.judges, rounds: gated, exemptFloor });
  const gate = gated.at(-1)!.gate;
  const out = resolve(input.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "table.md"), table);
  await writeFile(
    join(out, "gate.json"),
    `${JSON.stringify(
      {
        set: input.set,
        judges: input.judges,
        briefs,
        exemptFloor: exemptFloor.map((cell) => `${cell.brief}:${cell.category}`),
        round: newest.label,
        draws: newest.draws.map((draw) => draw.dir),
        pass: gate.pass,
        failures: gate.failures.map(describeFailure),
      },
      null,
      2,
    )}\n`,
  );
  return { gate, table, briefs };
}
