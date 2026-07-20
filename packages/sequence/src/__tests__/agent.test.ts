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

  test("agent params accept representative payloads", () => {
    const examples: Record<string, unknown> = {
      setProgram: { program: serializeSequenceProgram(minimal) },
      setStyle: { style: { accent: "#C77D2E", scale: 1 } },
      setTitle: { title: "Checkout" },
    };
    for (const operation of SEQUENCE_AGENT_PATCH_OPERATIONS) {
      expect(Value.Check(operation.params, examples[operation.type])).toBe(true);
    }
  });
});
