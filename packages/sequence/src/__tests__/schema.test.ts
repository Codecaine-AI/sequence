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
