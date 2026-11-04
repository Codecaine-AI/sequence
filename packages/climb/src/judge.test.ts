import { expect, test } from "bun:test";
import { lastJsonObject } from "./judge.ts";

test("lastJsonObject takes the final object after prose and fenced JSON", () => {
  const reply = 'Thinking {not json}.\n```json\n{"judge":"sol","scores":{"craft":9},"findings":[]}\n```\n';
  expect(lastJsonObject(reply)).toEqual({ judge: "sol", scores: { craft: 9 }, findings: [] });
});

test("lastJsonObject returns undefined when no object parses", () => {
  expect(lastJsonObject("no json here {broken")).toBeUndefined();
});
