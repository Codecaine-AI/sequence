#!/usr/bin/env bun
import { runDraw } from "./draw.ts";
import { JUDGE_IDS, runJudge } from "./judge.ts";
import { runRender } from "./render.ts";
import { runRound } from "./run-round.ts";
import { BRIEF_SETS, describeFailure, GATE, parseFloorExemption, runScore, type BriefSet } from "./score.ts";
import { runSetup } from "./setup.ts";

const USAGE = `climb: sequence-diagram quality climb

  climb round  --briefs <dir> --run <runDir> --judges <sol,opus,...> [--draws 3] [--concurrency 4] [--judge-concurrency 6] [--timeout-min 20]
  climb setup  --briefs <dir> --run <runDir>
  climb draw   --run <runDir> [--concurrency 4] [--timeout-min 20] [--only a,b]
  climb render --run <runDir> [--only a,b]
  climb judge  --run <runDir> --judges <sol,opus,...> --out <scoresDir> [--concurrency 6] [--only a,b]
  climb score  --scores <round> [--scores <round> ...] --set <climb|held-out> --judges <a,b,...> --out <dir> [--briefs <dir>] [--draws 3] [--exempt-floor <brief>:<category> ...]

A <round> for score is a climb round folder, a comma list of score folders (one per draw), or one score folder.
--exempt-floor skips the floor of ${GATE.minScore} for one brief in one category, for every judge. The cell still counts in the ${GATE.minMean} mean.

See packages/climb/README.md.`;

/** Flags as name -> values; a repeated flag keeps every value. */
function parseFlags(argv: readonly string[]): Map<string, string[]> {
  const flags = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    if (!flag.startsWith("--")) throw new Error(`Unexpected argument: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    flags.set(flag, [...(flags.get(flag) ?? []), value]);
    index += 1;
  }
  return flags;
}

function one(flags: Map<string, string[]>, name: string): string {
  const values = flags.get(name);
  if (!values || values.length === 0) throw new Error(`${name} is required`);
  if (values.length > 1) throw new Error(`${name} takes one value`);
  return values[0]!;
}

function optional(flags: Map<string, string[]>, name: string): string | undefined {
  return flags.has(name) ? one(flags, name) : undefined;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function allow(flags: Map<string, string[]>, names: readonly string[]): void {
  for (const name of flags.keys()) if (!names.includes(name)) throw new Error(`Unknown flag ${name}`);
}

const list = (value: string | undefined): string[] | undefined =>
  value?.split(",").map((part) => part.trim()).filter((part) => part.length > 0);

const isBriefSet = (value: string): value is BriefSet => (BRIEF_SETS as readonly string[]).includes(value);

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help") {
    console.log(USAGE);
    return 0;
  }
  const flags = parseFlags(rest);
  switch (command) {
    case "round": {
      allow(flags, ["--briefs", "--run", "--judges", "--draws", "--concurrency", "--judge-concurrency", "--timeout-min"]);
      const judges = list(one(flags, "--judges")) ?? [];
      if (judges.length === 0) throw new Error(`--judges needs at least one of ${JUDGE_IDS.join(", ")}`);
      for (const judge of judges) if (!JUDGE_IDS.includes(judge)) throw new Error(`Unknown judge ${judge}; known: ${JUDGE_IDS.join(", ")}`);
      const runDir = one(flags, "--run");
      const reports = await runRound({
        briefsDir: one(flags, "--briefs"),
        runDir,
        draws: positiveInteger(optional(flags, "--draws") ?? String(GATE.draws), "--draws"),
        judges,
        concurrency: positiveInteger(optional(flags, "--concurrency") ?? "4", "--concurrency"),
        judgeConcurrency: positiveInteger(optional(flags, "--judge-concurrency") ?? "6", "--judge-concurrency"),
        timeoutMs: positiveInteger(optional(flags, "--timeout-min") ?? "20", "--timeout-min") * 60_000,
      });
      for (const report of reports) {
        console.log(`${report.dir}: ${report.problems.length === 0 ? "every brief drawn, rendered and judged" : `${report.problems.length} problems`}`);
        for (const problem of report.problems) console.log(`  ${problem}`);
      }
      console.log(`next: climb score --scores ${runDir} --set <climb|held-out> --judges ${judges.join(",")} --out ${runDir}/score`);
      return reports.every((report) => report.problems.length === 0) ? 0 : 1;
    }
    case "setup": {
      allow(flags, ["--briefs", "--run"]);
      const round = await runSetup({ briefsDir: one(flags, "--briefs"), runDir: one(flags, "--run") });
      console.log(`round: ${round.briefs.length} briefs (${round.briefs.map((brief) => brief.slug).join(", ")})`);
      console.log(`commit ${round.repo.commit}${round.repo.dirty ? " (dirty)" : ""}, skill sha256 ${round.skill.sha256}`);
      return 0;
    }
    case "draw": {
      allow(flags, ["--run", "--concurrency", "--timeout-min", "--only"]);
      const results = await runDraw({
        runDir: one(flags, "--run"),
        concurrency: positiveInteger(optional(flags, "--concurrency") ?? "4", "--concurrency"),
        timeoutMs: positiveInteger(optional(flags, "--timeout-min") ?? "20", "--timeout-min") * 60_000,
        only: list(optional(flags, "--only")),
      });
      const failed = results.filter((result) => result.exitCode !== 0);
      console.log(`draw: ${results.length - failed.length}/${results.length} drawers exited 0`);
      return failed.length === 0 ? 0 : 1;
    }
    case "render": {
      allow(flags, ["--run", "--only"]);
      const results = await runRender({ runDir: one(flags, "--run"), only: list(optional(flags, "--only")) });
      for (const result of results) {
        console.log(`render ${result.slug}: ${result.rendered ? "diagram.png" : "not rendered (schema errors)"}, ${result.problems} diagnostics`);
      }
      return results.every((result) => result.rendered) ? 0 : 1;
    }
    case "judge": {
      allow(flags, ["--run", "--judges", "--out", "--concurrency", "--only"]);
      const judges = list(one(flags, "--judges")) ?? [];
      if (judges.length === 0) throw new Error(`--judges needs at least one of ${JUDGE_IDS.join(", ")}`);
      const results = await runJudge({
        runDir: one(flags, "--run"),
        judges,
        out: one(flags, "--out"),
        concurrency: positiveInteger(optional(flags, "--concurrency") ?? "6", "--concurrency"),
        only: list(optional(flags, "--only")),
      });
      const failed = results.filter((result) => !result.ok);
      console.log(`judge: ${results.length - failed.length}/${results.length} score files written`);
      return failed.length === 0 ? 0 : 1;
    }
    case "score": {
      allow(flags, ["--scores", "--set", "--judges", "--out", "--briefs", "--draws", "--exempt-floor"]);
      const set = one(flags, "--set");
      if (!isBriefSet(set)) throw new Error(`--set must be one of ${BRIEF_SETS.join(", ")}`);
      const judges = list(one(flags, "--judges")) ?? [];
      if (judges.length === 0) throw new Error("--judges needs at least one judge");
      const rounds = flags.get("--scores") ?? [];
      if (rounds.length === 0) throw new Error("--scores is required");
      const draws = positiveInteger(optional(flags, "--draws") ?? String(GATE.draws), "--draws");
      const exemptFloor = (flags.get("--exempt-floor") ?? []).map(parseFloorExemption);
      const { gate, briefs } = await runScore({ rounds, set, judges, out: one(flags, "--out"), briefsDir: optional(flags, "--briefs"), draws, exemptFloor });
      console.log(
        `${gate.pass ? "PASS" : "FAIL"}: set ${set}, ${judges.length} judges, ${briefs.length} briefs, ${draws} draws, newest round ${rounds.at(-1)}${
          exemptFloor.length === 0 ? "" : `, floor exempt: ${exemptFloor.map((cell) => `${cell.brief}:${cell.category}`).join(", ")}`
        }`,
      );
      for (const failure of gate.failures) console.log(`  ${describeFailure(failure)}`);
      return gate.pass ? 0 : 1;
    }
    default:
      throw new Error(`Unknown command ${command}\n\n${USAGE}`);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
