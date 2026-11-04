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

## Order the Columns Before You Write Them

Each column that an arrow crosses makes the flow harder to follow. Before
you write the participant lines, do these steps:

1. Find the first caller: the participant that sends the first message. Put it in column 1, even when an actor appears first in the brief.
2. Add each other participant in the order it first receives a message, a return included. Most calls then run left to right.
3. Count the messages of each pair of participants, in both directions.
4. For each pair with 3 or more messages, check that no other column sits between the two participants.
5. If a column sits between a busy pair, move the right one of the two left, next to the other. Then do step 4 again.

Never move a participant left of the participant that first calls it. For
example, a lead agent sends the first call to a builder and later asks Ford a
question. The lead goes in column 1, the builder in column 2, and Ford to
the right of both. When a kernel plugin writes `trace.db` 6 times, put
`trace.db` in the column right of the plugin, even when the plugin calls
two providers first.

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
  - A program without a `title` line keeps the diagram's existing title. Change or clear a title with `docs_sequence_set_title`.
  - Put exactly one blank line before `seq`.
- Number participants 1, 2, 3 with no gaps, in left-to-right order. The number is the participant's identity.
- Write participant fields in this order: `text=`, `kind=actor`, `label=`, `stereotype=`. Only `text=` is required.
- Write each message as `<from> <arrow> <to> text=<value>`.
  - `>` is a sync call. `->` is an async message. `-->` is a return, drawn dashed.
  - Use `>` when the caller waits for the reply: a tool call, an RPC or an HTTP request. Use `->` only when the sender does not wait, such as an event or a notification.
  - A self-message uses one number on both sides, such as `2 > 2 text=validate`.
- The fragments are `alt` with `else`, `opt` and `loop`.
  - Each needs `guard=`. An `else` can omit it.
  - Indent 2 spaces per level, never tabs. Dedent to close a fragment. There is no end keyword.
- A note is `note over=N text=<value>`. The side can also be `left=N` or `right=N`.
- A value can be bare only when it holds letters, digits, `_`, `(`, `)` and `-`. Quote all other values, such as `text="Login page"`.
- Never write coordinates, ids or activation bars. Layout comes from the structure.
  - A sync call activates its receiver until the matching return. Write that return to end the bar.
  - A caller that waits on a sync call is active for its turn: from the message that starts the turn to its last send or reply.
  - A sync call with no return gets a short bar over its own row.

## Writing for the Reader

- Name participants in the reader's words, such as `browser`, `docs server` and `database`.
  - Use one case style for every participant name, such as `Child agent` next to `Parent agent`.
- Order the columns with the steps in "Order the Columns Before You Write Them".
- Write a message label as the call or event the reader knows, such as `fetch(user)` or `200 OK`.
  - Keep a label to 40 characters or fewer. Keep each argument the brief names, and drop the others.
  - Use one label style in a diagram: a code call for a tool or API call, plain words for an event. Never add a prefix such as `publish:`.
- Draw one arrow for each call. Never join two calls in one label with "then", because a reply then seems to answer both.
- Show the return for each sync call that the reader needs to see answered.
  - If no reply comes back and the receiver goes on to message others, use `->`.
- When an `alt` branches on a call's result, draw the call and its reply before the `alt`. Let the guards name the result, such as `guard="409 stale revision"`.
- Keep a guard to 40 characters or fewer. State the condition only, and put a reason in a note.
- Keep a diagram to about 5 participants and 20 messages. Split a larger flow into two blocks.
- Use a note for one fact a message cannot carry. Keep it short.
  - Keep each condition that the brief gives for that fact.
- When a `docs_sequence_set_program` result lists a `long-label`, `long-guard`, `joined-calls`, `sync-without-return`, `reply-inside-branch` or `leftward-call` finding, fix it.

## References

- `references/language.md` is the complete v1 grammar, with every form, the canonical layout, the errors and the parts left out on purpose.
- `references/design-decisions.md` holds the settled design decisions: the JSON document as source of truth, the text program as a projection, and style kept apart.
- `snapshot.json` hashes every source of this folder. If a source hash differs from the file in the sequence repo, regenerate with `bun run skill:write`.
