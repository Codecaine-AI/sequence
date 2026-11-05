import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { lastJsonObject, runJudge } from "./judge.ts";

test("lastJsonObject takes the final object after prose and fenced JSON", () => {
  const reply = 'Thinking {not json}.\n```json\n{"judge":"sol","scores":{"craft":9},"findings":[]}\n```\n';
  expect(lastJsonObject(reply)).toEqual({ judge: "sol", scores: { craft: 9 }, findings: [] });
});

test("lastJsonObject returns undefined when no object parses", () => {
  expect(lastJsonObject("no json here {broken")).toBeUndefined();
});

test("lastJsonObject reads a whole-object reply whose finding text holds braces and escaped quotes", () => {
  const reply = '{"judge":"sol","findings":[{"text":"missing closing }"},{"text":"label \\"a{b\\" clips"}]}';
  expect(lastJsonObject(reply)).toEqual({ judge: "sol", findings: [{ text: "missing closing }" }, { text: 'label "a{b" clips' }] });
});

test("lastJsonObject finds an object with a lone brace in a string after prose", () => {
  const reply = 'Here is the score.\n{"judge":"opus","findings":[{"text":"a { with no close"}]}\nDone.';
  expect(lastJsonObject(reply)).toEqual({ judge: "opus", findings: [{ text: "a { with no close" }] });
});

test("runJudge clears an old score for a brief that has no diagram this time", async () => {
  const root = await mkdtemp(join(tmpdir(), "climb-judge-"));
  await mkdir(join(root, "run/stale"), { recursive: true });
  await mkdir(join(root, "scores/sol"), { recursive: true });
  await writeFile(join(root, "scores/sol/stale.json"), "{}");
  const results = await runJudge({ runDir: join(root, "run"), judges: ["sol"], out: join(root, "scores"), concurrency: 1 });
  expect(results).toEqual([]);
  expect(await Bun.file(join(root, "scores/sol/stale.json")).exists()).toBe(false);
});
