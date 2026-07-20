import { describe, expect, test } from "bun:test";
import {
  assertSequenceDocument,
  validateSequenceDocument,
} from "../schema";
import { combinedFragments, loginFlow, minimal } from "../fixtures";

describe("SequenceDocument schema", () => {
  test("accepts all fixtures", () => {
    for (const fixture of [loginFlow, combinedFragments, minimal]) {
      expect(validateSequenceDocument(fixture)).toEqual({ ok: true, errors: [] });
      expect(() => assertSequenceDocument(fixture)).not.toThrow();
    }
  });

  test("accepts per-element style groups", () => {
    const styled = {
      ...minimal,
      style: {
        accent: "#C77D2E",
        scale: 1.2,
        surface: { background: "#FFFFFF", margin: 32, columnGap: 160, rowGap: 40 },
        participant: { fill: "#FFF8F0", stroke: "#C77D2E", text: "#252525", padding: 20, cornerRadius: 6, opacity: 1 },
        lifeline: { stroke: "#C77D2E", dash: 4, opacity: 0.8 },
        message: { stroke: "#C77D2E", text: "#252525", labelGap: 8, opacity: 1 },
        activation: { fill: "#9AA0A6", stroke: "#9AA0A6", width: 16, opacity: 0.9 },
        fragment: { stroke: "#5B7FBD", labelFill: "#FFFFFF", labelText: "#5B7FBD", bodyOpacity: 0.1, padding: 16 },
        note: { fill: "#FFF8F0", stroke: "#C77D2E", text: "#252525", padding: 10, opacity: 1 },
      },
    };
    expect(validateSequenceDocument(styled)).toEqual({ ok: true, errors: [] });
  });

  test("rejects unknown fields inside style groups", () => {
    const malformed = {
      ...minimal,
      style: {
        participant: { fill: "#FFF8F0", shadow: "#000" },
        lifeline: { dash: "dotted" },
      },
    };
    const result = validateSequenceDocument(malformed);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("/style/participant"))).toBe(true);
    expect(result.errors.some((error) => error.includes("/style/lifeline/dash"))).toBe(true);
  });

  test("rejects malformed documents", () => {
    const malformed = {
      ...minimal,
      version: 2,
      participants: [{ id: "p1", name: "one", kind: "robot" }],
      style: { scale: "large" },
    };
    const result = validateSequenceDocument(malformed);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(() => assertSequenceDocument(malformed)).toThrow(TypeError);
  });

  test("rejects invalid references and fragment operand shapes", () => {
    const malformed = {
      ...minimal,
      items: [
        { kind: "message" as const, id: "m1", from: "p1", to: "missing", line: "sync" as const, text: "call" },
        {
          kind: "fragment" as const,
          id: "f1",
          op: "opt" as const,
          operands: [
            { items: [] },
            { guard: "extra", items: [] },
          ],
        },
      ],
    };
    const result = validateSequenceDocument(malformed);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("unknown participant"))).toBe(true);
    expect(result.errors.some((error) => error.includes("exactly one operand"))).toBe(true);
    expect(result.errors.some((error) => error.includes("requires a guard"))).toBe(true);
  });
});
