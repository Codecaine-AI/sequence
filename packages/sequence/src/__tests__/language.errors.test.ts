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

  test("rejects indentation not divisible into 2-space levels", () => {
    expectErrorAt(`${prefix}\n   1 > 2 text=call`, 5, "2 spaces");
  });

  test("rejects unknown participant numbers", () => {
    expectErrorAt(`${prefix}\n  1 > 3 text=call`, 5, "unknown participant number 3");
  });

  test("rejects non-dense participant numbering", () => {
    expectErrorAt(`participant 2 text=a

seq`, 1, "dense");
  });

  test("rejects else outside alt", () => {
    expectErrorAt(`${prefix}\n  else`, 5, "only legal");
  });

  test("rejects a garbage item line", () => {
    expectErrorAt(`${prefix}\n  abracadabra`, 5, "unknown sequence item");
  });

  test("collects independent line errors without throwing", () => {
    const result = parseSequenceProgram(`${prefix}\n  1 > 9 text=bad\n  garbage`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.line)).toEqual([5, 6]);
  });
});

