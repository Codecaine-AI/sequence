import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  SEQUENCE_AGENT_PATCH_OPERATIONS,
  applySequenceOperations,
  serializeSequenceProgram,
} from "../index";
import { loginFlow, minimal } from "../fixtures";

describe("sequence agent operations", () => {
  test("setProgram replaces structure while preserving style and id", () => {
    const source = { ...loginFlow, id: "kept-id", style: { accent: "#123456", scale: 1.2 } };
    const result = applySequenceOperations(source, [{
      type: "setProgram",
      program: serializeSequenceProgram(minimal),
    }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.id).toBe("kept-id");
    expect(result.document.style).toEqual(source.style);
    expect(result.document.participants).toEqual(minimal.participants);
    expect(result.document.items).toEqual(minimal.items);
    expect(result.document.title).toBe(minimal.title);
  });

  test("a titleless program does not erase an existing title", () => {
    const titleless = { ...minimal, title: undefined };
    const result = applySequenceOperations(loginFlow, [{
      type: "setProgram",
      program: serializeSequenceProgram(titleless),
    }]);
    expect(result.ok && result.document.title).toBe(loginFlow.title);
  });

  test("invalid programs surface line-numbered errors", () => {
    const result = applySequenceOperations(minimal, [{
      type: "setProgram",
      program: "participant 1 text=a\n\nseq\n  1 > 9 text=bad",
    }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Line 4:/);
  });

  test("setStyle shallow-merges and setTitle is independent", () => {
    const result = applySequenceOperations(loginFlow, [
      { type: "setStyle", style: { scale: 1.5 } },
      { type: "setTitle", title: "New title" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.style).toEqual({ accent: "#C77D2E", scale: 1.5 });
    expect(result.document.title).toBe("New title");
  });

  test("setStyle deep-merges element groups one level", () => {
    const first = applySequenceOperations(minimal, [
      { type: "setStyle", style: { accent: "#111111", participant: { fill: "#222222", padding: 24 } } },
    ]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applySequenceOperations(first.document, [
      { type: "setStyle", style: { participant: { stroke: "#333333" }, lifeline: { dash: 0 } } },
    ]);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.document.style).toEqual({
      accent: "#111111",
      participant: { fill: "#222222", padding: 24, stroke: "#333333" },
      lifeline: { dash: 0 },
    });
  });

  test("explicit null clears a field, and a group emptied by clears is dropped", () => {
    const base = applySequenceOperations(minimal, [
      { type: "setStyle", style: { accent: "#111111", note: { fill: "#222222", opacity: 0.5 } } },
    ]);
    if (!base.ok) throw new Error("setup failed");
    const cleared = applySequenceOperations(base.document, [
      { type: "setStyle", style: { accent: null, note: { fill: null } } },
    ]);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.document.style).toEqual({ note: { opacity: 0.5 } });

    const dropped = applySequenceOperations(cleared.document, [
      { type: "setStyle", style: { note: { opacity: null } } },
    ]);
    expect(dropped.ok && dropped.document.style).toEqual({});
  });

  test("explicit null clears a whole element group", () => {
    const base = applySequenceOperations(minimal, [
      { type: "setStyle", style: { scale: 1.4, fragment: { stroke: "#123456", padding: 20 } } },
    ]);
    if (!base.ok) throw new Error("setup failed");
    const cleared = applySequenceOperations(base.document, [
      { type: "setStyle", style: { fragment: null } },
    ]);
    expect(cleared.ok && cleared.document.style).toEqual({ scale: 1.4 });
  });

  test("agent params accept representative payloads", () => {
    const examples: Record<string, unknown> = {
      setProgram: { program: serializeSequenceProgram(minimal) },
      setStyle: {
        style: {
          accent: "#C77D2E",
          scale: 1,
          fragmentAccent: null,
          participant: { fill: "#FFF8F0", opacity: 0.9, stroke: null },
          surface: { margin: 32 },
          note: null,
        },
      },
      setTitle: { title: "Checkout" },
    };
    for (const operation of SEQUENCE_AGENT_PATCH_OPERATIONS) {
      expect(Value.Check(operation.params, examples[operation.type])).toBe(true);
    }
  });

  test("setStyle params reject unknown fields inside element groups", () => {
    const setStyle = SEQUENCE_AGENT_PATCH_OPERATIONS.find(({ type }) => type === "setStyle")!;
    expect(Value.Check(setStyle.params, { style: { participant: { glow: "#fff" } } })).toBe(false);
    expect(Value.Check(setStyle.params, { style: { banner: "#fff" } })).toBe(false);
  });
});
