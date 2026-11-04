import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { docsMcpCli, docsSystemRoot, OVERLAY_PRELOAD, runPaths, SKILL_DIR } from "./paths.ts";
import { readRound, type RoundBrief } from "./round.ts";

export const DRAWER = { model: "claude-opus-5-5", effort: "medium" } as const;
const MCP_SERVER = "docs-system";
/** The three tools a drawer edits a diagram with. */
export const SEQUENCE_TOOLS = ["docs_sequence_set_program", "docs_sequence_set_title", "docs_sequence_set_style"] as const;

/**
 * Variables of the Claude Code session that runs `climb draw`. A drawer is a
 * fresh top-level session, so none of them may leak into it.
 */
const PARENT_SESSION_VARIABLES = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
  "CLAUDE_PROJECT_DIR",
];

/** SKILL.md, then each reference file, as one system-prompt section. */
export async function skillPrompt(): Promise<string> {
  const parts = [await readFile(join(SKILL_DIR, "SKILL.md"), "utf8")];
  const references = (await readdir(join(SKILL_DIR, "references"))).filter((file) => file.endsWith(".md")).sort();
  for (const file of references) {
    parts.push(`<reference path="references/${file}">\n${await readFile(join(SKILL_DIR, "references", file), "utf8")}\n</reference>`);
  }
  return [
    "You have the `sequence` Agent Skill loaded. Its SKILL.md and every reference file follow. Treat `references/<file>` mentions as the matching <reference> section below.",
    "",
    ...parts,
  ].join("\n");
}

export function drawerPrompt({ brief, entry }: { brief: string; entry: RoundBrief }): string {
  return [
    "Draw the sequence diagram this brief asks for.",
    "",
    "<brief>",
    brief.trim(),
    "</brief>",
    "",
    "Where it goes:",
    `- The docs workspace holds one page per brief. Your page is docs path \`${entry.page}\`.`,
    `- The page already holds an empty sequence block with id \`${entry.blockId}\`. Its sidecar is \`${entry.src}\`.`,
    "- Write the diagram into that block. Do not add, move or delete blocks, and do not edit any other page.",
    `- Edit the diagram only with ${SEQUENCE_TOOLS.map((tool) => `\`${tool}\``).join(", ")}. Read hashes with \`docs_component_read\`.`,
    "",
    "When the diagram is done, reply with one line: done.",
  ].join("\n");
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const DaemonStart = Type.Object({ url: Type.String(), pid: Type.Number() });
/** The drawer sees the brief, the skill and the docs tools, never a person's CLAUDE.md or hooks. */
const DRAWER_SETTINGS = {
  claudeMdExcludes: [join(homedir(), ".claude/CLAUDE.md"), "**/CLAUDE.md", "**/CLAUDE.local.md"],
  disableAllHooks: true,
};

function docsEnvironment(paths: ReturnType<typeof runPaths>): Record<string, string> {
  return {
    BUN_OPTIONS: `--preload ${OVERLAY_PRELOAD}`,
    CODECAINE_DOCS_STATE_DIR: paths.docsState,
    CLIMB_OVERLAY_LOG: paths.overlayLog,
  };
}

async function docsCli({ args, env }: { args: string[]; env: Record<string, string> }): Promise<string> {
  const proc = Bun.spawn([process.execPath, docsMcpCli(), ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`docs-mcp ${args.join(" ")} failed (${code}): ${err || out}`);
  return out;
}

async function runDrawer({ entry, runDir, timeoutMs }: { entry: RoundBrief; runDir: string; timeoutMs: number }): Promise<{ slug: string; exitCode: number | null; timedOut: boolean; durationMs: number }> {
  const paths = runPaths(runDir);
  const dir = paths.brief(entry.slug);
  await mkdir(dir, { recursive: true });
  const prompt = drawerPrompt({ brief: await readFile(join(dir, "brief.md"), "utf8"), entry });
  await writeFile(join(dir, "prompt.md"), prompt);
  const args = [
    "-p",
    prompt,
    "--model", DRAWER.model,
    "--effort", DRAWER.effort,
    "--output-format", "stream-json",
    "--verbose",
    "--mcp-config", paths.mcpConfig,
    "--strict-mcp-config",
    "--append-system-prompt-file", paths.systemPrompt,
    // No built-in tools: the docs MCP is the drawer's only instrument.
    "--tools", "",
    "--allowedTools", `mcp__${MCP_SERVER}`,
    "--permission-mode", "dontAsk",
    "--no-session-persistence",
    // Auth and the gateway still come from user settings; CLAUDE.md files and hooks must not reach the drawer.
    "--settings", JSON.stringify(DRAWER_SETTINGS),
  ];
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of PARENT_SESSION_VARIABLES) delete env[name];
  const started = Date.now();
  const transcript = Bun.file(join(dir, "transcript.jsonl"));
  const stderr = Bun.file(join(dir, "draw.stderr.log"));
  const proc = Bun.spawn(["claude", ...args], { cwd: paths.project, env, stdin: "ignore", stdout: transcript, stderr });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
  }, timeoutMs);
  const exitCode = await proc.exited;
  clearTimeout(timer);
  const durationMs = Date.now() - started;
  await writeFile(
    join(dir, "draw.json"),
    json({
      model: DRAWER.model,
      effort: DRAWER.effort,
      startedAt: new Date(started).toISOString(),
      durationMs,
      exitCode,
      timedOut,
      command: ["claude", ...args.map((arg) => (arg === prompt ? "<prompt.md>" : arg))],
    }),
  );
  return { slug: entry.slug, exitCode, timedOut, durationMs };
}

async function pool<T, R>(items: readonly T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function runDraw({ runDir, concurrency, timeoutMs, only }: { runDir: string; concurrency: number; timeoutMs: number; only?: readonly string[] }) {
  const round = await readRound(runDir);
  const paths = runPaths(runDir);
  const entries = only ? round.briefs.filter((entry) => only.includes(entry.slug)) : round.briefs;
  if (entries.length === 0) throw new Error("No briefs to draw.");
  const docsRoot = docsSystemRoot();
  const env = docsEnvironment(paths);

  await mkdir(paths.draw, { recursive: true });
  await mkdir(paths.docsState, { recursive: true, mode: 0o700 });
  await rm(paths.overlayLog, { force: true });
  await writeFile(paths.systemPrompt, await skillPrompt());
  await writeFile(
    paths.mcpConfig,
    json({
      mcpServers: {
        [MCP_SERVER]: {
          type: "stdio",
          command: process.execPath,
          args: [docsMcpCli(docsRoot), "mcp", "--workspace", paths.project],
          env,
        },
      },
    }),
  );

  // A private docs daemon for this round: its own state folder, started here with the overlay,
  // so no drawer reaches Ford's shared daemon or a daemon that loaded another sequence copy.
  await docsCli({ args: ["stop"], env }).catch(() => undefined);
  const startOutput: unknown = JSON.parse(await docsCli({ args: ["start"], env }));
  if (!Value.Check(DaemonStart, startOutput)) throw new Error(`Unexpected docs-mcp start output: ${JSON.stringify(startOutput)}`);
  const started = startOutput;
  try {
    const overlay = await readFile(paths.overlayLog, "utf8").catch(() => "");
    const daemonLines = overlay.split("\n").filter((line) => line.startsWith(`${started.pid} `));
    if (daemonLines.length === 0) {
      throw new Error(`The docs daemon (pid ${started.pid}) loaded no overlaid sequence module. See ${paths.overlayLog} and README.md.`);
    }
    console.log(`docs daemon pid ${started.pid} at ${started.url}: ${daemonLines.length} sequence modules from this checkout (${docsRoot})`);
    return await pool(entries, concurrency, async (entry) => {
      console.log(`draw ${entry.slug}: started`);
      const result = await runDrawer({ entry, runDir, timeoutMs });
      console.log(`draw ${entry.slug}: exit ${result.exitCode}${result.timedOut ? " (timed out)" : ""} after ${Math.round(result.durationMs / 1000)} s`);
      return result;
    });
  } finally {
    await docsCli({ args: ["stop"], env }).catch((error) => console.error(`docs daemon stop failed: ${error}`));
  }
}
