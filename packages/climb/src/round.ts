import { readFile, writeFile } from "node:fs/promises";

import { runPaths } from "./paths.ts";

/** One brief inside a round: where its page, block and sidecar live in the scratch project. */
export interface RoundBrief {
  slug: string;
  /** Docs path of the page (bundle folder under docs/). */
  page: string;
  blockId: string;
  /** Block `src`, bundle-relative. */
  src: string;
  /** Sidecar path relative to the round folder. */
  sidecar: string;
}

/** `<runDir>/round.json`: what this round measured. */
export interface Round {
  version: 1;
  createdAt: string;
  briefsDir: string;
  repo: { commit: string; dirty: boolean };
  /** sha256 of WRITING_GUIDE, the drawer's system prompt text. */
  writingGuide: { sha256: string };
  briefs: RoundBrief[];
}

export async function readRound(runDir: string): Promise<Round> {
  const path = runPaths(runDir).round;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error(`No round at ${path}. Run climb setup first.`);
  }
  const round = JSON.parse(text) as Round;
  if (round.version !== 1 || !Array.isArray(round.briefs)) throw new Error(`Unsupported round file: ${path}`);
  return round;
}

export async function writeRound(runDir: string, round: Round): Promise<void> {
  await writeFile(runPaths(runDir).round, `${JSON.stringify(round, null, 2)}\n`);
}
