# The Sequence Language — v1 grammar

The language is a derived, disposable view of a sequence document. The
serializer writes it, an agent rewrites the whole program, and the parser
expands it back into document structure. The JSON `SequenceDocument` remains
the source of truth. The language is optimized for **clarity over
compression**: every value is labeled, every reference is a declared number,
and indentation is the only nesting syntax.

A program has three parts, in this order:

1. **The optional title** — one `title` line, present if and only if the
   document has a title.
2. **Participants** — declarations in left-to-right column order.
3. **The sequence** — one `seq` block containing messages, combined
   fragments, and notes in top-to-bottom order.

In canonical form, the title (when present) is immediately followed by the
participant declarations. Exactly one blank line separates the participants
from `seq`. Blank lines do not create nesting. Tabs are an error; indentation
is exactly 2 spaces per level. `seq` is at the left margin, and every item in
it is indented by at least one level.

## Reference numbers

Every participant line declares a positive integer. Numbers are dense and in
declaration order: `1`, `2`, …, `n`. All messages and notes refer to
participants by those numbers. The number **is** the participant's identity
in the program; `text=` is only its short name. Several participants may
share the same text without ambiguity.

Numbers are a projection detail. Parsing assigns participant ids `p1` through
`pn` from their numbers. Messages, fragments, and notes receive deterministic
ids `m1`…, `f1`…, and `n1`… in encounter order. Document ids and item ids are
never written in the language.

## The optional title

    title "Login flow"

The title line is legal only as the first line. Its value is a JSON string.
The line is emitted if and only if `document.title` is set. A program without
this line has no title.

## Participants

    participant 1 text=user kind=actor
    participant 2 text=login label="Login page"
    participant 3 text=db label="Database server" stereotype=servlet

Fields are in fixed order:

| field | required | values |
|-------|----------|--------|
| number | yes | the next dense positive integer |
| `text=` | yes | the participant's short name |
| `kind=` | optional | `actor`; omitted means `participant` |
| `label=` | optional | a longer display label |
| `stereotype=` | optional | the UML stereotype text |

The only explicit non-default kind is `kind=actor`. `kind=participant` is the
default and is omitted in canonical output. Participant array order is
therefore both declaration order and left-to-right column order.

## The sequence

The sequence block is mandatory and appears exactly once:

    seq
      1 > 2 text=request

`seq` is written at the left margin. Its items are ordered top to bottom and
indented one level. Nested operand items are indented one additional level.
Dedentation closes a construct; there is no `end` keyword.

### Messages

    1 > 2 text="input(username, password)"
    2 -> 3 text=confirm
    3 --> 2 text="end fetching"

The form is `<from> <arrow> <to> text=<v>`. Both references must name declared
participant numbers.

| arrow | message line | rendering |
|-------|--------------|-----------|
| `>` | sync | solid line, filled arrowhead |
| `->` | async | solid line, open arrowhead |
| `-->` | return | dashed line, open arrowhead |

A self-message uses the same number on both sides:

    2 > 2 text=validate

### Combined fragments

Fragments are indentation-nested containers. `alt`, `opt`, and `loop` each
begin an operand, and the operand's items are indented one more level.

#### `alt` — alternatives

    alt guard=available
      2 > 1 text=success
    else guard=retryable
      2 --> 1 text=retry
    else
      2 --> 1 text=failure

An `alt` has one or more operands. Its first line is `alt guard=<v>`. Further
operands use `else` or `else guard=<v>` at the same indentation as the `alt`.
A non-first operand may omit its guard. An `else` is legal only when it is at
the same indentation as its `alt` and directly follows the first operand's
items or the preceding alternative operand's items; it cannot stand alone.

#### `opt` — optional behavior

    opt guard="needs confirmation"
      2 -> 3 text=confirm

An `opt` has exactly one operand and requires `guard=<v>`.

#### `loop` — repeated behavior

    loop guard="for each order"
      1 > 2 text=dispatch

A `loop` has exactly one operand and requires `guard=<v>`.

Fragments may nest. Indentation alone defines their operand scope:

    loop guard="for each order"
      alt guard=stocked
        1 > 2 text=ship
      else guard=backordered
        2 --> 1 text=wait

There is no closing keyword. Dedenting from an operand closes it; dedenting
from the fragment closes the fragment.

### Notes

    note over=2 text="validates first"
    note left=1 text=caller
    note right=3 text=database

The form is `note <side>=<N> text=<v>`, where `<side>` is exactly `over`,
`left`, or `right`, and `<N>` is a declared participant number.

## Value syntax

Values used in labeled fields are bare tokens if and only if they match
`/^[A-Za-z0-9_()-]*$/` and contain no space. All other values are JSON-quoted
strings. JSON quoting supplies the standard escapes for quotes, backslashes,
and control characters.

    text=user
    text=input(username)
    stereotype=servlet
    text="end fetching"
    label="Database server"
    text="say \"hello\""

Field names and field order are fixed for every construct. There are no
positional text values and no interchangeable field orderings. The title is
the sole exception to the `key=value` presentation: its JSON string directly
follows the `title` keyword.

## Canonical form

`serializeSequenceProgram` is the single canonical serializer. It emits:

- an optional first-line title exactly when `document.title` is set;
- participants numbered densely in array order;
- participant fields in the fixed order `text=`, `kind=actor`, `label=`,
  `stereotype=`, omitting absent optional fields and the default participant
  kind;
- exactly one blank line before `seq`;
- `seq` at the left margin;
- 2-space indentation at every nesting level;
- messages, fragment operands, and notes in document order; and
- canonical bare or JSON-quoted values according to the value rule above.

For any valid document,
`parseSequenceProgram(serializeSequenceProgram(document))` is structurally
identical modulo deterministically regenerated ids. Serializing the parsed
result again reproduces the exact same bytes:

    serialize(parse(serialize(document))) === serialize(document)

The parser creates a `SequenceDocument` with `version: 1`, id `"sequence"`,
and `style: {}`. Callers that apply an agent rewrite preserve the real
document id and style while replacing its parsed structure.

## Complete example

    participant 1 text=user kind=actor
    participant 2 text=login label="Login page"
    participant 3 text=db label="Database server" stereotype=servlet

    seq
      1 > 2 text="input(username, password)"
      2 > 3 text="fetch(username, password)"
      alt guard="fetching"
        3 --> 2 text="end fetching"
        2 > 1 text="success"
      else
        2 --> 1 text="incorrect input"
      opt guard="needs confirmation"
        2 -> 3 text="confirm"
      note over=2 text="validates first"

Read aloud: three participants appear left to right—an actor, a login page,
and a stereotyped database server. The actor calls the login page, which
calls the database. An alternative covers success and incorrect-input paths;
an optional confirmation follows; finally, a note sits over the login page.

## Error behavior

`parseSequenceProgram(text)` never throws for bad input. It returns either a
successful document or line-numbered errors:

```ts
{ ok: true, document: SequenceDocument }

{ ok: false, errors: { line: number; message: string }[] }
```

The parser collects multiple errors where feasible. Tabs, indentation not in
2-space levels, non-dense participant numbering, references to unknown
participant numbers, an `else` outside its matching `alt`, incorrect field
order, illegal arrows or sides, malformed quoted values, and unrecognized
lines are errors. A failed parse produces no replacement document.

## Deliberately absent

- **Styling** — accent colors, fragment color, participant fill, and scale
  live only in `SequenceDocument.style`. Styling never appears in a program.
- **Coordinates and geometry** — the language describes ordered structure.
  Deterministic layout derives every position, row, frame, and path.
- **Document and item ids** — numbers provide temporary program identity;
  stable ids are regenerated deterministically during parsing.
- **Activations** — activation bars are derived from sync calls and matching
  returns within operand scope. They are not expressible in the language.
- **Patch commands** — an agent rewrites the whole program. There is no
  patch DSL and no incremental edit syntax.

