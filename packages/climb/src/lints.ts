import { existsSync } from "node:fs";
import { join } from "node:path";

import type { SequenceDocument } from "../../sequence/src/schema.ts";
import { SEQUENCE_PACKAGE } from "./paths.ts";

/** One lint result, the shape `climb render` writes to metrics.json. */
export interface LintResult {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** Item or participant id the finding points at, when it has one. */
  target?: string;
}

/**
 * Hook for diagram lints. When packages/sequence/src/lints/index.ts exists,
 * it must export `lintSequence(document): LintResult[]`, and render calls it.
 * Until then every diagram has an empty lint list.
 */
export const LINTS_MODULE = join(SEQUENCE_PACKAGE, "src/lints/index.ts");

export async function runLints(document: SequenceDocument): Promise<{ available: boolean; results: LintResult[] }> {
  if (!existsSync(LINTS_MODULE)) return { available: false, results: [] };
  const module: unknown = await import(LINTS_MODULE);
  if (typeof module !== "object" || module === null || !("lintSequence" in module) || typeof module.lintSequence !== "function") {
    throw new Error(`${LINTS_MODULE} must export lintSequence(document)`);
  }
  const results: unknown = await module.lintSequence(document);
  if (!Array.isArray(results)) throw new Error("lintSequence must return an array");
  return { available: true, results };
}
