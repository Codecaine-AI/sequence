import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** This checkout's root: the sequence repo the climb measures. */
export const REPO_ROOT = resolve(import.meta.dir, "../../..");
export const CLIMB_ROOT = join(REPO_ROOT, "packages/climb");
/** The sequence package of THIS checkout. Climb imports it by relative path, never by package name. */
export const SEQUENCE_PACKAGE = join(REPO_ROOT, "packages/sequence");
export const SKILL_DIR = join(SEQUENCE_PACKAGE, "skills/sequence");
/** Bun preload that makes the docs server load SEQUENCE_PACKAGE (see README.md). */
export const OVERLAY_PRELOAD = join(CLIMB_ROOT, "src/overlay-preload.ts");

/**
 * The docs-system checkout whose MCP server the drawer talks to.
 * CLIMB_DOCS_SYSTEM wins. Otherwise a sibling `../docs-system`, then the
 * checkout that `@codecaine-ai/docs-mcp` resolves to from this repo.
 */
export function docsSystemRoot(): string {
  const fromEnv = process.env.CLIMB_DOCS_SYSTEM;
  const candidates = [
    fromEnv,
    join(REPO_ROOT, "../docs-system"),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "packages/docs-mcp/src/cli.ts"))) return resolve(candidate);
  }
  try {
    const manifest = realpathSync(Bun.resolveSync("@codecaine-ai/docs-mcp/package.json", REPO_ROOT));
    return resolve(dirname(manifest), "../..");
  } catch {
    throw new Error("Cannot find docs-system. Set CLIMB_DOCS_SYSTEM to its checkout.");
  }
}

export const docsMcpCli = (root = docsSystemRoot()): string => join(root, "packages/docs-mcp/src/cli.ts");

/** Layout of one round folder. */
export function runPaths(runDir: string) {
  const root = resolve(runDir);
  return {
    root,
    round: join(root, "round.json"),
    project: join(root, "project"),
    docs: join(root, "project/docs"),
    draw: join(root, "draw"),
    mcpConfig: join(root, "draw/mcp-config.json"),
    systemPrompt: join(root, "draw/system-prompt.md"),
    docsState: join(root, "draw/docs-state"),
    overlayLog: join(root, "draw/overlay.log"),
    brief: (slug: string) => join(root, slug),
  };
}
