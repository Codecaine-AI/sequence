import { join, resolve } from "node:path";

import { runDraw } from "./draw.ts";
import { runJudge } from "./judge.ts";
import { runRender } from "./render.ts";
import { runSetup } from "./setup.ts";

/** `<runDir>/draw-<n>`: one full single-draw round folder. `climb score --scores <runDir>` reads these. */
export const drawDir = (runDir: string, n: number): string => join(resolve(runDir), `draw-${n}`);

export interface RoundInput {
  briefsDir: string;
  runDir: string;
  draws: number;
  judges: string[];
  concurrency: number;
  judgeConcurrency: number;
  timeoutMs: number;
}

/** What went wrong in one draw. An empty list means every step finished for every brief. */
export interface DrawReport {
  dir: string;
  problems: string[];
}

/**
 * Setup, draw, render and judge every brief `draws` times, one draw after another.
 * Each draw keeps the single-draw layout under `<runDir>/draw-<n>`, with scores in `draw-<n>/scores`.
 * A failed drawer or judge does not stop the round: `climb score` reports the missing score.
 */
export async function runRound(input: RoundInput): Promise<DrawReport[]> {
  const reports: DrawReport[] = [];
  for (let n = 1; n <= input.draws; n += 1) {
    const dir = drawDir(input.runDir, n);
    console.log(`round: draw ${n} of ${input.draws} in ${dir}`);
    await runSetup({ briefsDir: input.briefsDir, runDir: dir });
    const drawn = await runDraw({ runDir: dir, concurrency: input.concurrency, timeoutMs: input.timeoutMs });
    const rendered = await runRender({ runDir: dir });
    const judged = await runJudge({ runDir: dir, judges: input.judges, out: join(dir, "scores"), concurrency: input.judgeConcurrency });
    reports.push({
      dir,
      problems: [
        ...drawn.filter((result) => result.exitCode !== 0).map((result) => `draw ${result.slug}: exit ${result.exitCode}${result.timedOut ? " (timed out)" : ""}`),
        ...rendered.filter((result) => !result.rendered).map((result) => `render ${result.slug}: not rendered`),
        ...judged.filter((result) => !result.ok).map((result) => `judge ${result.judge} ${result.slug}: ${result.detail}`),
      ],
    });
  }
  return reports;
}
