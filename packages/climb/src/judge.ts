import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { CLAUDE_BIN, PARENT_SESSION_VARIABLES } from "./draw.ts";
import { JudgeScoreSchema, type JudgeScore } from "./score-schema.ts";

const JUDGE_BRIEF = resolve(dirname(import.meta.dir), "judge-brief.md");

/** How each judge runs: one fresh CLI process per diagram, in the judge's own harness. */
const JUDGES: Record<string, (input: { prompt: string; png: string; lastMessage: string }) => string[]> = {
  sol: ({ prompt, png, lastMessage }) => [
    "codex", "exec", "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"', "--enable", "fast_mode",
    "--skip-git-repo-check", "--sandbox", "read-only", "-i", png, "-o", lastMessage, prompt,
  ],
  opus: ({ prompt }) => claudeJudge("claude-opus-5-5", prompt),
  fable: ({ prompt }) => claudeJudge("claude-fable-5-1", prompt),
};

export const JUDGE_IDS = Object.keys(JUDGES);

function claudeJudge(model: string, prompt: string): string[] {
  return [
    CLAUDE_BIN, "-p", prompt, "--model", model, "--effort", "high", "--output-format", "text",
    "--tools", "Read", "--allowedTools", "Read", "--permission-mode", "dontAsk", "--no-session-persistence",
    "--settings", JSON.stringify({ claudeMdExcludes: ["**/CLAUDE.md", "**/CLAUDE.local.md", `${process.env.HOME}/.claude/CLAUDE.md`], disableAllHooks: true }),
  ];
}

function judgePrompt({ judge, slug, judgeBrief, brief, program, png }: { judge: string; slug: string; judgeBrief: string; brief: string; program: string; png: string }): string {
  return [
    judgeBrief.trim(),
    "",
    `Your judge id is \`${judge}\` and the brief id is \`${slug}\`.`,
    `Open the rendered diagram at ${png} and look at it before you score.`,
    "",
    "<brief>", brief.trim(), "</brief>",
    "",
    "<program>", program.trim(), "</program>",
    "",
    "Reply with the score JSON only.",
  ].join("\n");
}

/** The last top-level JSON object in a model reply. */
export function lastJsonObject(text: string): unknown {
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1)) {
    let depth = 0;
    for (let start = end; start >= 0; start -= 1) {
      if (text[start] === "}") depth += 1;
      else if (text[start] === "{" && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

async function judgeOnce({ judge, slug, runDir, out }: { judge: string; slug: string; runDir: string; out: string }): Promise<JudgeScore | string> {
  const dir = join(runDir, slug);
  const png = resolve(dir, "diagram.png");
  const prompt = judgePrompt({
    judge, slug, png,
    judgeBrief: await readFile(JUDGE_BRIEF, "utf8"),
    brief: await readFile(join(dir, "brief.md"), "utf8"),
    program: await readFile(join(dir, "program.txt"), "utf8"),
  });
  const logDir = resolve(out, judge, "logs");
  await mkdir(logDir, { recursive: true });
  const lastMessage = join(logDir, `${slug}.last.txt`);
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of PARENT_SESSION_VARIABLES) delete env[name];
  const proc = Bun.spawn(JUDGES[judge]!({ prompt, png, lastMessage }), { cwd: dir, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  await writeFile(join(logDir, `${slug}.stdout.txt`), stdout);
  await writeFile(join(logDir, `${slug}.stderr.txt`), stderr);
  const reply = judge === "sol" ? await readFile(lastMessage, "utf8").catch(() => stdout) : stdout;
  const parsed = lastJsonObject(reply);
  if (code !== 0) return `exit ${code}`;
  if (!Value.Check(JudgeScoreSchema, parsed)) return `invalid score JSON: ${[...Value.Errors(JudgeScoreSchema, parsed)].slice(0, 3).map((e) => `${e.path} ${e.message}`).join("; ")}`;
  if (parsed.judge !== judge || parsed.brief !== slug) return `wrong ids ${parsed.judge}/${parsed.brief}`;
  return parsed;
}

/** Score every rendered brief in `runDir` with each judge, one retry per failure. Writes `<out>/<judge>/<slug>.json`. */
export async function runJudge({ runDir, judges, out, concurrency, only }: { runDir: string; judges: string[]; out: string; concurrency: number; only?: string[] }): Promise<{ judge: string; slug: string; ok: boolean; detail: string }[]> {
  for (const judge of judges) if (!JUDGES[judge]) throw new Error(`Unknown judge ${judge}; known: ${JUDGE_IDS.join(", ")}`);
  const entries = await readdir(runDir, { withFileTypes: true });
  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || (only && !only.includes(entry.name))) continue;
    if (await Bun.file(join(runDir, entry.name, "diagram.png")).exists()) slugs.push(entry.name);
  }
  const jobs = judges.flatMap((judge) => slugs.sort().map((slug) => ({ judge, slug })));
  const results: { judge: string; slug: string; ok: boolean; detail: string }[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const started = Date.now();
      let result = await judgeOnce({ ...job, runDir, out });
      if (typeof result === "string") result = await judgeOnce({ ...job, runDir, out });
      const seconds = Math.round((Date.now() - started) / 1000);
      if (typeof result === "string") {
        results.push({ ...job, ok: false, detail: result });
        console.log(`judge ${job.judge} ${job.slug}: FAILED after retry (${result})`);
      } else {
        await writeFile(join(out, job.judge, `${job.slug}.json`), `${JSON.stringify(result, null, 2)}\n`);
        results.push({ ...job, ok: true, detail: `${seconds} s` });
        console.log(`judge ${job.judge} ${job.slug}: ok in ${seconds} s`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}
