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

test("leftward-call reports a call to a column on the left that the flow reaches later, once per pair", () => {
  // p3 sends first, so it belongs in column 1; p1 and p2 sit left of it.
  const results = lintSequence(documentWith([
    { kind: "message", id: "start", from: "p3", to: "p1", line: "sync", text: "build" },
    { kind: "message", id: "done", from: "p1", to: "p3", line: "return", text: "done" },
    { kind: "message", id: "again", from: "p3", to: "p1", line: "sync", text: "fix" },
    { kind: "message", id: "store", from: "p3", to: "p4", line: "sync", text: "save" },
    { kind: "message", id: "event", from: "p4", to: "p3", line: "async", text: "saved event" },
    {
      kind: "fragment",
      id: "f1",
      op: "opt",
      operands: [{ guard: "x", items: [{ kind: "message", id: "ask", from: "p3", to: "p2", line: "async", text: "ask" }] }],
    },
  ]));

  // A message back to a participant the flow reached first ("saved event")
  // and a return are not reported.
  const leftward = results.filter(({ rule }) => rule === "leftward-call");
  expect(leftward.map(({ target }) => target)).toEqual(["start", "ask"]);
  expect(leftward[0]!.message).toContain("Move a right of c");
});

test("leftward-call stays quiet when a call goes back to the first caller", () => {
  const results = lintSequence(documentWith([
    { kind: "message", id: "start", from: "p1", to: "p2", line: "sync", text: "task" },
    { kind: "message", id: "ask", from: "p2", to: "p1", line: "sync", text: "ask" },
    { kind: "message", id: "answer", from: "p1", to: "p2", line: "return", text: "answer" },
  ]));

  expect(results.filter(({ rule }) => rule === "leftward-call")).toEqual([]);
});

test("reply-inside-branch reports a call whose reply opens the alt that branches on it", () => {
  const reply = (id: string, text: string): SequenceItem => ({ kind: "message", id, from: "p2", to: "p1", line: "return", text });
  const results = lintSequence(documentWith([
    { kind: "message", id: "verify", from: "p1", to: "p2", line: "sync", text: "add(verify)" },
    { kind: "message", id: "note", from: "p1", to: "p2", line: "sync", text: "add(note)" },
    reply("noted", "note added"),
    {
      kind: "fragment",
      id: "f1",
      op: "alt",
      operands: [{ guard: "stale", items: [reply("stale", "409")] }, { items: [reply("ok", "verify added")] }],
    },
    // The receiver works on before the alt, so the alt ends the run, not the call.
    { kind: "message", id: "run", from: "p1", to: "p2", line: "sync", text: "run" },
    { kind: "message", id: "spawn", from: "p2", to: "p3", line: "async", text: "spawn" },
    {
      kind: "fragment",
      id: "f2",
      op: "alt",
      operands: [{ guard: "done", items: [reply("done", "result")] }, { items: [reply("cancelled", "stopped")] }],
    },
  ]));

  expect(results.filter(({ rule }) => rule === "reply-inside-branch").map(({ target }) => target)).toEqual(["verify"]);
});
