import { describe, expect, test } from "bun:test";
import { parseSequenceProgram } from "../language";

const prefix = `participant 1 text=a
participant 2 text=b

seq`;

function expectErrorAt(program: string, line: number, text?: string): void {
  const result = parseSequenceProgram(program);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("program unexpectedly parsed");
  expect(result.errors.some((error) => error.line === line)).toBe(true);
  if (text) expect(result.errors.some((error) => error.line === line && error.message.includes(text))).toBe(true);
}

describe("sequence language errors", () => {
  test("rejects tab indentation", () => {
    expectErrorAt(`${prefix}\n\t1 > 2 text=call`, 5, "tabs");
  });

  test("collects independent line errors without throwing", () => {
    const result = parseSequenceProgram(`${prefix}\n  1 > 9 text=bad\n  garbage`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.line)).toEqual([5, 6]);
  });
});

