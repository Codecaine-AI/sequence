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

  const crossed = results.filter(({ rule }) => rule === "crossed-columns");
  expect(crossed.map(({ target }) => target)).toEqual(["far"]);
  expect(crossed[0]!.message).toContain("crosses 2 other columns (b, c)");
});

test("long-label and long-guard report text over 40 characters", () => {
  const long = "session_update(sessionId, threadId, phase, addLinks)";
  const results = lintSequence(documentWith([
    {
      kind: "fragment",
      id: "f1",
      op: "opt",
      operands: [{
        guard: "T3 answered and modelSelection differs from the last entry",
        items: [
          { kind: "message", id: "long", from: "p1", to: "p2", line: "async", text: long },
          { kind: "message", id: "short", from: "p1", to: "p2", line: "async", text: "session_update(phase)" },
        ],
      }],
    },
  ]));

  expect(results.map(({ rule, target }) => [rule, target])).toEqual([["long-label", "long"], ["long-guard", "f1"]]);
});

test("joined-calls reports one arrow that carries two calls", () => {
  const results = lintSequence(documentWith([
    { kind: "message", id: "joined", from: "p1", to: "p2", line: "async", text: "add(verify), then add(note)" },
    { kind: "message", id: "one", from: "p1", to: "p2", line: "async", text: "add(verify)" },
    { kind: "message", id: "summary", from: "p2", to: "p1", line: "return", text: "result, then settled" },
  ]));

  expect(results.map(({ rule, target }) => [rule, target])).toEqual([["joined-calls", "joined"]]);
});

test("sync-without-return reports an unanswered call whose receiver goes on to message others", () => {
  const results = lintSequence(documentWith([
    { kind: "message", id: "answered", from: "p1", to: "p2", line: "sync", text: "read" },
    {
      kind: "fragment",
      id: "f1",
      op: "opt",
      operands: [{ guard: "x", items: [{ kind: "message", id: "reply", from: "p2", to: "p1", line: "return", text: "data" }] }],
    },
    { kind: "message", id: "store", from: "p1", to: "p4", line: "sync", text: "write row" },
    { kind: "message", id: "unanswered", from: "p1", to: "p3", line: "sync", text: "deliver" },
    { kind: "message", id: "self", from: "p3", to: "p3", line: "sync", text: "check" },
    { kind: "message", id: "onward", from: "p3", to: "p4", line: "async", text: "resume" },
  ]));

  const unanswered = results.filter(({ rule }) => rule === "sync-without-return");
  expect(unanswered.map(({ target }) => target)).toEqual(["unanswered"]);
});
