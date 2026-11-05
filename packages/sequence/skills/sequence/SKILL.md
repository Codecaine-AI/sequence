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
  - Use `>` for every call the caller waits on: a tool call, an RPC, an HTTP request or a write that must finish first.
  - A waited-on call stays `>` even when the diagram draws no reply for it.
  - Use `->` only for a message nobody waits on, such as an event, a notification or a chat message.
  - A self-message uses one number on both sides, such as `2 > 2 text=validate`.
- The fragments are `alt` with `else`, `opt` and `loop`.
  - Each needs `guard=`. An `else` can omit it.
  - Indent 2 spaces per level, never tabs. Dedent to close a fragment. There is no end keyword.
- A note is `note over=N text=<value>`. The side can also be `left=N` or `right=N`.
- A value can be bare only when it holds letters, digits, `_`, `(`, `)` and `-`. Quote all other values, such as `text="Login page"`.
- Never write coordinates, ids or activation bars. Layout comes from the structure.
  - A sync call activates its receiver until the matching return.
  - A caller that waits on a sync call is active for its turn: from the message that starts the turn to its last send or reply.
  - A sync call with no return gets a short bar over its own row.

## Writing for the Reader

- Name participants in the reader's words, such as `browser`, `docs server` and `database`.
  - Keep a header to a name of 1 to 3 words, in one case style for every participant, such as `Child agent` next to `Parent agent`.
  - Put a code name the brief gives, such as `buildLead(threads)`, in `stereotype=`. Leave any other detail about a participant out of the diagram: never move it into a note.
- Order the columns with the steps in "Order the Columns Before You Write Them".
- Write a message label as the call or event the reader knows, such as `fetch(user)` or `200 OK`.
  - Keep a plain-words label to 40 characters or fewer, and a code call to 56. Keep each argument the brief names, and drop the others.
  - Use one label style in a diagram: a code call for a tool or API call, plain words for an event. Never add a prefix such as `publish:`.
- Copy each detail the brief lists. Never rename, merge or drop one.
  - Copy each argument the brief names into the call label, such as `getOrder(orderId, userId)`. When the brief lists a tool's parameters, write the required ones by name.
  - Never abbreviate a name the brief uses, such as `baseRevision` to `baseRev`. A code call that lists the brief's arguments can run to 56 characters; shorten plain words first, such as `session_update(id, thread, phase, links)`. Never write an ellipsis, and never move a dropped argument into a note.
  - Never write an argument the brief does not give for that call. A guessed argument, such as `read(childThreadId)` for a tool that takes `requestId`, misstates the tool.
  - Write a guard in the brief's words, in prose with no code operator such as `!=`. Keep every condition and remark the brief puts in it, such as `(this part is proposed)` or `the last entry of models`.
  - Draw each return the brief lists as its own arrow, in the brief's order. Never merge two returns into one.
  - Keep the place the brief gives for a value, such as `ids in body.meta`.
- Draw one arrow for each call. Never join two calls in one label with "then", because a reply then seems to answer both.
- Draw a return only where the brief lists one or the reader must see the reply.
  - A waited-on call with no listed return stays `>` with no return.
  - Never add a return such as `saved` or `ok` only to close a call.
- When an `alt` branches on a call's reply, put each reply inside the branch it starts, as that branch's first step.
  - Never merge two outcomes into one reply before the `alt`, such as `200 or 409`.
  - Let each guard name the condition, and draw only the replies the brief lists.
- Keep a guard to 60 characters or fewer by cutting filler words, never a condition. A note cannot restrict a branch, so a condition never moves to a note. Keep a reason the brief gives with `because` in the guard, in a few words, such as `after a replan`.
- Keep a diagram to about 5 participants and 20 messages. Split a larger flow into two blocks.
- Use a note only where the brief lists one. Keep it short, one fact a message cannot carry.
  - Keep each condition that the brief gives for that fact.
  - Start every note with a capital letter, and every prose label with a lowercase letter, so each kind of text has one look.
- When a `docs_sequence_set_program` result lists a `long-label`, `long-guard`, `joined-calls` or `leftward-call` finding, fix it.

## References

- `references/language.md` is the complete v1 grammar, with every form, the canonical layout, the errors and the parts left out on purpose.
- `references/design-decisions.md` holds the settled design decisions: the JSON document as source of truth, the text program as a projection, and style kept apart.
- `snapshot.json` hashes every source of this folder. If a source hash differs from the file in the sequence repo, regenerate with `bun run skill:write`.
