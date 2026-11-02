import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { REPO_ROOT, SKILL_DIR, SKILL_SOURCES, checkSkill, diffFolders, writeSkill, type SkillSnapshot } from "../skill/generate-skill";

const temps: string[] = [];
const temp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "sequence-skill-test-"));
  temps.push(dir);
  return dir;
};
afterEach(async () => { await Promise.all(temps.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

const snapshotOf = async (dir: string): Promise<SkillSnapshot> => JSON.parse(await readFile(join(dir, "snapshot.json"), "utf8"));

describe("sequence skill generator", () => {
  test("two runs into fresh folders write byte-identical skills", async () => {
    const [first, second] = [await temp(), await temp()];
    await writeSkill(first);
    await writeSkill(second);
    expect(await diffFolders(first, second)).toEqual([]);
  });

  test("the committed skill folder matches a fresh run", async () => {
    expect(await checkSkill(SKILL_DIR)).toEqual([]);
  });

  test("editing one source line changes that source hash and the snapshot id", async () => {
    const root = await temp();
    for (const source of SKILL_SOURCES) {
      await mkdir(dirname(join(root, source.path)), { recursive: true });
      await writeFile(join(root, source.path), await readFile(join(REPO_ROOT, source.path)));
    }
    const [before, after] = [await temp(), await temp()];
    await writeSkill(before, root);
    const state = join(root, "STATE.md");
    await writeFile(state, (await readFile(state, "utf8")).replace("1. **The JSON `SequenceDocument` is the single source of truth.**", "1. **The JSON `SequenceDocument` is the only source of truth.**"));
    await writeSkill(after, root);

    const [old, edited] = [await snapshotOf(before), await snapshotOf(after)];
    expect(edited.snapshotId).not.toBe(old.snapshotId);
    const hash = (snapshot: SkillSnapshot, path: string) => snapshot.sources.find(source => source.path === path)!.sha256;
    expect(hash(edited, "STATE.md")).not.toBe(hash(old, "STATE.md"));
    expect(hash(edited, "docs/10-language/doc.json")).toBe(hash(old, "docs/10-language/doc.json"));
    expect(await readFile(join(after, "references/design-decisions.md"), "utf8")).toContain("is the only source of truth");
  });

  test("the grammar page renders its headings, tables and code blocks", async () => {
    const dir = await temp();
    await writeSkill(dir);
    const language = await readFile(join(dir, "references/language.md"), "utf8");
    expect(language).toStartWith("# The Sequence Language, v1 Grammar\n");
    expect(language).toContain("| `->` | async | solid line, open arrowhead |");
    expect(language).toContain("```text\nparticipant 1 text=user kind=actor\n");
    expect(language).toContain("- **Styling**\n  - Accent colors");
  });

  test("SKILL.md stays under 120 lines and names its MCP server", async () => {
    const dir = await temp();
    await writeSkill(dir);
    const skill = await readFile(join(dir, "SKILL.md"), "utf8");
    expect(skill.split("\n").length).toBeLessThan(120);
    expect(skill).toContain('compatibility: "Needs the docs-system MCP server."');
  });
});
