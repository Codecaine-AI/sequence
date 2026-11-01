---
name: sequence
description: "Write and edit UML sequence diagrams as sequence blocks in Codecaine docs pages through the docs-system MCP: request flows, call and return order, retries, failures and alternatives between named participants. Use after the instruments skill routes a diagram to a sequence block, when Ford says sequence diagram, or before any docs_sequence_* call."
compatibility: "Needs the docs-system MCP server."
metadata:
  version: "0.1.0"
  product: sequence
---

# Sequence

A sequence diagram is always a block inside the docs page it explains. The
block only points at a sidecar file, `assets/sequences/<name>.sequence.json`.
That JSON document is the source of truth. You edit it as a short text
program, and the docs-mcp `docs_sequence_*` tools are the only write path.
This skill has no MCP server of its own.

## When to Use a Sequence Block

- Use one when the order of calls and returns between named parts explains the behavior.
- Good subjects are a request flow, a handshake, a retry, a failure path and an agent tool loop.
- Keep it bounded: one interaction, from its first call to its last return.
- Use a canvas for structure, ownership or a state chart. A sequence block shows time, not structure.
- Check each message against source code or a trace before you draw it.

## Workflow

1. Call `docs_discover`, then `docs_begin`. Keep its `task_id` for every call below.
2. Read `docs_guidance` topic `style`, then read the page with `docs_read`.
3. Read `references/language.md` before you write a program. Read `references/design-decisions.md` before you change how a diagram is built.
4. For a new diagram, call `docs_component_create` with `component: "sequence"`, then insert the block with the returned `src`.
5. Call `docs_component_read` on the block. Pass its `doc_hash` as `expected_hash` and its `hash` as `expected_component_hash`.
6. Call `docs_sequence_set_program` with the whole program and both hashes.
7. Read the result: the program text, the findings and the SVG path. Open the SVG, fix each finding, and send the whole program again.
8. Set colors and spacing with `docs_sequence_set_style`. Style never goes in the program. `docs_sequence_set_title` changes only the title.
9. Run `docs_check` on the page, fix what it reports, then call `docs_end`.

A hash conflict means the page or the sidecar changed. Read it again, merge
your change into the new program, and send it once more. A parse error
names its line. Fix every listed line, because a failed parse changes nothing.

## Rules of the Language

- Send the whole program every time. There is no patch or partial program.
- A program has three parts in this order: an optional `title` line, the participants, then `seq`.
  - A program without a `title` line removes the title. Keep the line when you rewrite a titled diagram.
  - Put exactly one blank line before `seq`.
- Number participants 1, 2, 3 with no gaps, in left-to-right order. The number is the participant's identity.
- Write participant fields in this order: `text=`, `kind=actor`, `label=`, `stereotype=`. Only `text=` is required.
- Write each message as `<from> <arrow> <to> text=<value>`.
  - `>` is a sync call. `->` is an async message. `-->` is a return, drawn dashed.
  - A self-message uses one number on both sides, such as `2 > 2 text=validate`.
- The fragments are `alt` with `else`, `opt` and `loop`.
  - Each needs `guard=`. An `else` can omit it.
  - Indent 2 spaces per level, never tabs. Dedent to close a fragment. There is no end keyword.
- A note is `note over=N text=<value>`. The side can also be `left=N` or `right=N`.
- A value can be bare only when it holds letters, digits, `_`, `(`, `)` and `-`. Quote all other values, such as `text="Login page"`.
- Never write coordinates, ids or activation bars. Layout comes from the structure.
  - A sync call activates its receiver until the matching return. Write that return to end the bar.

## Writing for the Reader

- Name participants in the reader's words, such as `browser`, `docs server` and `database`.
- Write a message label as the call or event the reader knows, such as `fetch(user)` or `200 OK`.
- Show the return for each sync call that the reader needs to see answered.
- Keep a diagram to about 5 participants and 20 messages. Split a larger flow into two blocks.
- Use a note for one fact a message cannot carry. Keep it short.

## References

- `references/language.md` is the complete v1 grammar, with every form, the canonical layout, the errors and the parts left out on purpose.
- `references/design-decisions.md` holds the settled design decisions: the JSON document as source of truth, the text program as a projection, and style kept apart.
- `snapshot.json` hashes every source of this folder. If a source hash differs from the file in the sequence repo, regenerate with `bun run skill:write`.
