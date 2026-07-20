import { describe, expect, test } from "bun:test";
import type { SequenceDocument } from "../schema";
import { combinedFragments, loginFlow, minimal } from "../fixtures";
import { parseSequenceProgram, serializeSequenceProgram } from "../language";

const fixtures = [loginFlow, combinedFragments, minimal];

function structure(document: SequenceDocument) {
  return {
    version: document.version,
    title: document.title,
    participants: document.participants,
    items: document.items,
  };
}

describe("sequence language round trips", () => {
  for (const fixture of fixtures) {
    test(`${fixture.id} is byte-identical after parse`, () => {
      const program = serializeSequenceProgram(fixture);
      const parsed = parseSequenceProgram(program);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      expect(structure(parsed.document)).toEqual(structure(fixture));
      expect(serializeSequenceProgram(parsed.document)).toBe(program);
    });
  }

  test("login-flow is the canonical example", () => {
    expect(serializeSequenceProgram(loginFlow)).toBe(`participant 1 text=user kind=actor
participant 2 text=login label="Login page"
participant 3 text=db label="Database server" stereotype=servlet

seq
  1 > 2 text="input(username, password)"
  2 > 3 text="fetch(username, password)"
  alt guard=fetching
    3 --> 2 text="end fetching"
    2 > 1 text=success
  else
    2 --> 1 text="incorrect input"
  opt guard="needs confirmation"
    2 -> 3 text=confirm
  note over=2 text="validates first"`);
  });

  test("values use bare tokens only when safe", () => {
    const document: SequenceDocument = {
      ...minimal,
      title: "Quoted title",
      participants: [
        { ...minimal.participants[0]!, name: "" },
        { ...minimal.participants[1]!, label: "two words" },
      ],
      items: minimal.items.map((item, index) => (
        item.kind === "message" ? { ...item, text: index === 0 ? "call()" : "has spaces" } : item
      )),
    };
    const program = serializeSequenceProgram(document);
    expect(program).toContain('title "Quoted title"');
    expect(program).toContain("participant 1 text= kind=actor");
    expect(program).toContain('label="two words"');
    expect(program).toContain("text=call()");
    expect(parseSequenceProgram(program).ok).toBe(true);
  });
});

