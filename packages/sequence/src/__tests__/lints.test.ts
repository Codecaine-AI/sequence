import { expect, test } from "bun:test";

import { lintSequence } from "../lints";
import type { SequenceDocument, SequenceItem } from "../schema";

const documentWith = (items: SequenceItem[]): SequenceDocument => ({
  version: 1,
  id: "lint-test",
  participants: ["a", "b", "c", "d"].map((name, index) => ({ id: `p${index + 1}`, name, kind: "participant" as const })),
  items,
  style: {},
});

test("crossed-columns reports a message that crosses 2 or more other lifelines, inside fragments too", () => {
  const results = lintSequence(documentWith([
    { kind: "message", id: "near", from: "p1", to: "p2", line: "sync", text: "near" },
    { kind: "message", id: "one", from: "p1", to: "p3", line: "sync", text: "one over" },
    {
      kind: "fragment",
      id: "f1",
      op: "opt",
      operands: [{ guard: "x", items: [{ kind: "message", id: "far", from: "p4", to: "p1", line: "return", text: "far" }] }],
    },
    { kind: "message", id: "self", from: "p4", to: "p4", line: "async", text: "self" },
  ]));

  expect(results.map(({ rule, target }) => [rule, target])).toEqual([["crossed-columns", "far"]]);
  expect(results[0]!.message).toContain("crosses 2 other columns (b, c)");
});
