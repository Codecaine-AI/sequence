import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { REPO_ROOT, runPaths, SKILL_DIR } from "./paths.ts";
import { writeRound, type Round, type RoundBrief } from "./round.ts";

/** A brief slug doubles as a docs folder name and a sidecar file name. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

async function git(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-C", REPO_ROOT, ...args], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  return text.trim();
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

/** sha256 over every file of a folder: its sorted relative paths and their contents. */
export async function hashFolder(dir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await listFiles(dir)) {
    hash.update(`${file}\0`);
    hash.update(await readFile(join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** The empty sidecar a drawer starts from. */
export const emptySequence = (id: string) => ({ version: 1, id, participants: [], items: [], style: {} });

/** One docs page whose only content is the brief's sequence block. */
function pageDocument({ slug, blockId, src }: { slug: string; blockId: string; src: string }) {
  const root = `b-${slug}-root`;
  return {
    schemaVersion: 1,
    id: slug,
    title: slug,
    root,
    blocks: {
      [root]: { id: root, type: "paragraph", props: {}, children: [blockId] },
      [blockId]: { id: blockId, type: "sequence", props: { src }, children: [] },
    },
  };
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export async function runSetup({ briefsDir, runDir }: { briefsDir: string; runDir: string }): Promise<Round> {
  const briefsRoot = resolve(briefsDir);
  const paths = runPaths(runDir);
  const slugs = (await readdir(briefsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const briefs: string[] = [];
  for (const slug of slugs) {
    if (!(await stat(join(briefsRoot, slug, "brief.md")).catch(() => undefined))?.isFile()) continue;
    if (!SLUG.test(slug)) throw new Error(`Brief folder ${slug} must match ${SLUG}`);
    briefs.push(slug);
  }
  if (briefs.length === 0) throw new Error(`No <slug>/brief.md folders in ${briefsRoot}`);

  // A round starts from a clean scratch project; transcripts and renders of an older round go with it.
  await rm(paths.project, { recursive: true, force: true });
  await rm(paths.draw, { recursive: true, force: true });
  for (const slug of briefs) await rm(paths.brief(slug), { recursive: true, force: true });
  await mkdir(paths.docs, { recursive: true });
  await writeFile(join(paths.project, "codecaine.docs.json"), json({ name: "Climb scratch", kind: "scratch", docsRoot: "docs", products: ["docs"] }));

  const entries: RoundBrief[] = [];
  for (const slug of briefs) {
    const blockId = `b-${slug}-sequence`;
    const src = `./assets/sequences/${slug}.sequence.json`;
    const bundle = join(paths.docs, slug);
    const sidecar = join(bundle, "assets/sequences", `${slug}.sequence.json`);
    await mkdir(join(bundle, "assets/sequences"), { recursive: true });
    await writeFile(join(bundle, "doc.json"), json(pageDocument({ slug, blockId, src })));
    await writeFile(sidecar, json(emptySequence(slug)));
    await mkdir(paths.brief(slug), { recursive: true });
    await copyFile(join(briefsRoot, slug, "brief.md"), join(paths.brief(slug), "brief.md"));
    entries.push({ slug, page: slug, blockId, src, sidecar: relative(paths.root, sidecar) });
  }

  const round: Round = {
    version: 1,
    createdAt: new Date().toISOString(),
    briefsDir: briefsRoot,
    repo: { commit: await git(["rev-parse", "HEAD"]), dirty: (await git(["status", "--porcelain"])).length > 0 },
    skill: { path: relative(REPO_ROOT, SKILL_DIR), sha256: await hashFolder(SKILL_DIR) },
    briefs: entries,
  };
  await writeRound(paths.root, round);
  return round;
}
