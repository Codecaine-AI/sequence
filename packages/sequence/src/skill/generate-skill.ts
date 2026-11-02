/**
 * Writes the portable `sequence` Agent Skill folder from this repo's own sources:
 * the v1 grammar page (`docs/10-language/doc.json`), the design decisions in `STATE.md`,
 * and this file, which holds the SKILL.md text. `snapshot.json` hashes every source,
 * so a later compare can tell that the installed skill is stale.
 *
 *   bun run skill:write   regenerate packages/sequence/skills/sequence
 *   bun run skill:check   regenerate to a temp folder, exit 1 if it differs
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Bump when the output format changes without a source change. */
export const SKILL_GENERATOR_VERSION = 1;
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const SKILL_DIR = join(REPO_ROOT, "packages/sequence/skills/sequence");

export type SkillSource = { path: string; kind: "language" | "decisions" | "generator" };
export const SKILL_SOURCES: readonly SkillSource[] = [
  { path: "docs/10-language/doc.json", kind: "language" },
  { path: "STATE.md", kind: "decisions" },
  { path: "packages/sequence/src/skill/generate-skill.ts", kind: "generator" },
];

const sha256 = (content: string): string => createHash("sha256").update(content).digest("hex");

// ---------------------------------------------------------------------------
// docs-system page → Markdown. Unknown block types and attributes throw, so a
// grammar page the renderer cannot carry fails the write instead of losing text.

type Run = { insert: string; attributes?: Record<string, unknown> };
type Cell = string | Run[];
type Block = { id: string; type: string; props: Record<string, unknown>; text?: Run[]; children: string[] };
type DocPage = { title: string; root: string; blocks: Record<string, Block> };

const codeSpan = (text: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length));
  const ticks = "`".repeat(longest + 1);
  return longest > 0 || text.startsWith(" ") ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`;
};

function inline(runs: readonly Run[]): string {
  return runs.map(run => {
    const attributes = run.attributes ?? {};
    for (const key of Object.keys(attributes)) {
      if (key !== "bold" && key !== "code") throw new Error(`Unsupported text attribute: ${key}`);
    }
    let text = attributes.code ? codeSpan(run.insert) : run.insert;
    if (attributes.bold) {
      const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
      text = body ? `${lead}**${body}**${trail}` : text;
    }
    return text;
  }).join("");
}

const cell = (value: Cell): string =>
  (typeof value === "string" ? value : inline(value)).replace(/\|/g, "\\|").replace(/\n/g, " ");

function fence(code: string, language: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map(run => run.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${language}\n${code}\n${ticks}`;
}

function renderList(page: DocPage, ids: readonly string[], indent: string): string {
  let number = 0;
  let ordered: boolean | undefined;
  return ids.map(id => {
    const block = page.blocks[id]!;
    if (block.type !== "list-item") throw new Error(`List ${id} holds a ${block.type} block`);
    const isOrdered = block.props.ordered === true;
    number = isOrdered === ordered ? number + 1 : 1;
    ordered = isOrdered;
    const marker = isOrdered ? `${number}. ` : "- ";
    const line = `${indent}${marker}${inline(block.text ?? [])}`;
    return block.children.length ? `${line}\n${renderList(page, block.children, indent + " ".repeat(marker.length))}` : line;
  }).join("\n");
}

function renderBlock(page: DocPage, block: Block): string {
  if (block.type !== "list-item" && block.children.length) throw new Error(`Block ${block.id} has unsupported children`);
  switch (block.type) {
    case "heading": return `${"#".repeat(Number(block.props.level))} ${inline(block.text ?? [])}`;
    case "paragraph": return inline(block.text ?? []);
    case "code": return fence(inline((block.text ?? []).map(run => ({ insert: run.insert }))), String(block.props.language ?? ""));
    case "structured-table": {
      const columns = block.props.columns as Cell[];
      const rows = block.props.rows as Cell[][];
      return [columns, columns.map(() => "---"), ...rows]
        .map((row, index) => `| ${row.map(value => (index === 1 ? String(value) : cell(value))).join(" | ")} |`)
        .join("\n");
    }
    default: throw new Error(`Unsupported block type ${block.type} (${block.id})`);
  }
}

/** Render a docs-system page's text, headings, lists, tables and code blocks to Markdown. */
export function renderDocPage(page: DocPage): string {
  const parts: string[] = [`# ${page.title}`];
  const top = page.blocks[page.root]!.children;
  for (let index = 0; index < top.length;) {
    const block = page.blocks[top[index]!]!;
    if (block.type === "list-item") {
      let end = index;
      while (end < top.length && page.blocks[top[end]!]!.type === "list-item") end++;
      parts.push(renderList(page, top.slice(index, end), ""));
      index = end;
    } else {
      parts.push(renderBlock(page, block));
      index++;
    }
  }
  return parts.join("\n\n");
}

/** The body of one `## ` section of a Markdown file, without its heading. */
export function markdownSection(markdown: string, headingPrefix: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex(line => line.startsWith(`## ${headingPrefix}`));
  if (start < 0) throw new Error(`No "## ${headingPrefix}" section`);
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim();
}

// ---------------------------------------------------------------------------
// The skill folder.

const stamp = (source: string): string =>
  `Generated by \`bun run skill:write\` in the sequence repo from \`${source}\`. Do not edit this file by hand.`;

const SKILL_MD = `---
name: sequence
description: "Write and edit UML sequence diagrams as sequence blocks in Codecaine docs pages through the docs-system MCP: request flows, call and return order, retries, failures and alternatives between named participants. Use after the instruments skill routes a diagram to a sequence block, when Ford says sequence diagram, or before any docs_sequence_* call."
compatibility: "Needs the docs-system MCP server."
metadata:
  version: "0.1.0"
  product: sequence
---

# Sequence

A sequence diagram is always a block inside the docs page it explains. The
block only points at a sidecar file, \`assets/sequences/<name>.sequence.json\`.
That JSON document is the source of truth. You edit it as a short text
program, and the docs-mcp \`docs_sequence_*\` tools are the only write path.
This skill has no MCP server of its own.

## When to Use a Sequence Block

- Use one when the order of calls and returns between named parts explains the behavior.
- Good subjects are a request flow, a handshake, a retry, a failure path and an agent tool loop.
- Keep it bounded: one interaction, from its first call to its last return.
- Use a canvas for structure, ownership or a state chart. A sequence block shows time, not structure.
- Check each message against source code or a trace before you draw it.

## Workflow

1. Call \`docs_discover\`, then \`docs_begin\`. Keep its \`task_id\` for every call below.
2. Read \`docs_guidance\` topic \`style\`, then read the page with \`docs_read\`.
3. Read \`references/language.md\` before you write a program. Read \`references/design-decisions.md\` before you change how a diagram is built.
4. For a new diagram, call \`docs_component_create\` with \`component: "sequence"\`, then insert the block with the returned \`src\`.
5. Call \`docs_component_read\` on the block. Pass its \`doc_hash\` as \`expected_hash\` and its \`hash\` as \`expected_component_hash\`.
6. Call \`docs_sequence_set_program\` with the whole program and both hashes.
7. Read the result: the program text, the findings and the SVG path. Open the SVG, fix each finding, and send the whole program again.
8. Set colors and spacing with \`docs_sequence_set_style\`. Style never goes in the program. \`docs_sequence_set_title\` changes only the title.
9. Run \`docs_check\` on the page, fix what it reports, then call \`docs_end\`.

A hash conflict means the page or the sidecar changed. Read it again, merge
your change into the new program, and send it once more. A parse error
names its line. Fix every listed line, because a failed parse changes nothing.

## Rules of the Language

- Send the whole program every time. There is no patch or partial program.
- A program has three parts in this order: an optional \`title\` line, the participants, then \`seq\`.
  - A program without a \`title\` line keeps the diagram's existing title. Change or clear a title with \`docs_sequence_set_title\`.
  - Put exactly one blank line before \`seq\`.
- Number participants 1, 2, 3 with no gaps, in left-to-right order. The number is the participant's identity.
- Write participant fields in this order: \`text=\`, \`kind=actor\`, \`label=\`, \`stereotype=\`. Only \`text=\` is required.
- Write each message as \`<from> <arrow> <to> text=<value>\`.
  - \`>\` is a sync call. \`->\` is an async message. \`-->\` is a return, drawn dashed.
  - A self-message uses one number on both sides, such as \`2 > 2 text=validate\`.
- The fragments are \`alt\` with \`else\`, \`opt\` and \`loop\`.
  - Each needs \`guard=\`. An \`else\` can omit it.
  - Indent 2 spaces per level, never tabs. Dedent to close a fragment. There is no end keyword.
- A note is \`note over=N text=<value>\`. The side can also be \`left=N\` or \`right=N\`.
- A value can be bare only when it holds letters, digits, \`_\`, \`(\`, \`)\` and \`-\`. Quote all other values, such as \`text="Login page"\`.
- Never write coordinates, ids or activation bars. Layout comes from the structure.
  - A sync call activates its receiver until the matching return. Write that return to end the bar.

## Writing for the Reader

- Name participants in the reader's words, such as \`browser\`, \`docs server\` and \`database\`.
- Write a message label as the call or event the reader knows, such as \`fetch(user)\` or \`200 OK\`.
- Show the return for each sync call that the reader needs to see answered.
- Keep a diagram to about 5 participants and 20 messages. Split a larger flow into two blocks.
- Use a note for one fact a message cannot carry. Keep it short.

## References

- \`references/language.md\` is the complete v1 grammar, with every form, the canonical layout, the errors and the parts left out on purpose.
- \`references/design-decisions.md\` holds the settled design decisions: the JSON document as source of truth, the text program as a projection, and style kept apart.
- \`snapshot.json\` hashes every source of this folder. If a source hash differs from the file in the sequence repo, regenerate with \`bun run skill:write\`.
`;

export type SkillSnapshot = {
  schemaVersion: 1;
  generatorVersion: number;
  snapshotId: string;
  sources: { path: string; sha256: string; kind: SkillSource["kind"] }[];
};

/** Build every file of the skill folder, keyed by its path inside the folder. */
export async function buildSkill(repoRoot: string = REPO_ROOT): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const source of SKILL_SOURCES) contents.set(source.path, await readFile(join(repoRoot, source.path), "utf8"));
  const sources = SKILL_SOURCES.map(source => ({ path: source.path, sha256: sha256(contents.get(source.path)!), kind: source.kind }));
  const snapshot: SkillSnapshot = {
    schemaVersion: 1,
    generatorVersion: SKILL_GENERATOR_VERSION,
    snapshotId: `sha256:${sha256(JSON.stringify({ generatorVersion: SKILL_GENERATOR_VERSION, sources }))}`,
    sources,
  };
  const language = JSON.parse(contents.get("docs/10-language/doc.json")!) as DocPage;
  const decisions = markdownSection(contents.get("STATE.md")!, "Core architecture decisions");
  return new Map([
    ["SKILL.md", SKILL_MD],
    ["references/language.md", `${renderDocPage(language).replace(/^(# .*)$/m, `$1\n\n${stamp("docs/10-language/doc.json")}`)}\n`],
    ["references/design-decisions.md", `# Sequence Design Decisions\n\n${stamp("STATE.md")}\n\nThese decisions are settled. Do not change them without Ford.\n\n${decisions}\n`],
    ["snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`],
  ]);
}

/** Replace `outDir` with a fresh copy of the skill. The generator owns the whole folder. */
export async function writeSkill(outDir: string = SKILL_DIR, repoRoot: string = REPO_ROOT): Promise<string[]> {
  const files = await buildSkill(repoRoot);
  await rm(outDir, { recursive: true, force: true });
  for (const [path, content] of files) {
    await mkdir(dirname(join(outDir, path)), { recursive: true });
    await writeFile(join(outDir, path), content);
  }
  return [...files.keys()];
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter(entry => entry.isFile()).map(entry => relative(dir, join(entry.parentPath, entry.name))).sort();
}

/** Paths that differ between two folders, including files only one of them has. */
export async function diffFolders(left: string, right: string): Promise<string[]> {
  const paths = [...new Set([...(await listFiles(left)), ...(await listFiles(right))])].sort();
  const differing: string[] = [];
  for (const path of paths) {
    const [a, b] = await Promise.all([readFile(join(left, path)).catch(() => null), readFile(join(right, path)).catch(() => null)]);
    if (!a || !b || !a.equals(b)) differing.push(path);
  }
  return differing;
}

/** Regenerate into a temp folder and list the committed files that differ. */
export async function checkSkill(outDir: string = SKILL_DIR, repoRoot: string = REPO_ROOT): Promise<string[]> {
  const temp = await mkdtemp(join(tmpdir(), "sequence-skill-"));
  try {
    await writeSkill(temp, repoRoot);
    return await diffFolders(temp, outDir);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const differing = await checkSkill();
    if (differing.length) {
      console.error(`The sequence skill is stale. Run \`bun run skill:write\`. Differing files:\n${differing.map(path => `  ${path}`).join("\n")}`);
      process.exit(1);
    }
    console.log(`The sequence skill at ${relative(REPO_ROOT, SKILL_DIR)} is current.`);
  } else {
    const files = await writeSkill();
    console.log(`Wrote ${files.length} files to ${relative(REPO_ROOT, SKILL_DIR)}.`);
  }
}
