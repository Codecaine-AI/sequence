import { describe, expect, test } from "bun:test";
import { WRITING_GUIDE } from "../language";
import { renderWritingGuide } from "../language/write-writing-guide";

describe("WRITING_GUIDE", () => {
  test("the committed constant matches a fresh render of the grammar page and STATE.md", async () => {
    expect(WRITING_GUIDE).toBe(await renderWritingGuide());
  });

  test("holds the whole grammar page, its writing sections, and the design decisions", () => {
    expect(WRITING_GUIDE).toStartWith("# The Sequence Language, v1 Grammar\n");
    for (const heading of ["## Participants", "## Deliberately absent", "## Order the Columns Before You Write Them", "## Writing for the Reader", "# Sequence Design Decisions"]) {
      expect(WRITING_GUIDE).toContain(`\n${heading}\n`);
    }
    expect(WRITING_GUIDE).toContain("| `->` | async | solid line, open arrowhead |");
    expect(WRITING_GUIDE).toContain("1. **The JSON `SequenceDocument` is the single source of truth.**");
  });
});
