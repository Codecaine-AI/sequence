# Sequence diagram judge brief

You judge one sequence diagram that an agent drew from a written brief. Score
it in nine categories and return one JSON object.

## What you get

- `brief.md`: the request the agent worked from. It names the system, the
  participants and every step the diagram must show.
- `diagram.png`: the diagram as a reader sees it in a docs page. It is drawn
  at 2x scale on a light background with the Inter font.
- `program.txt`: the diagram's text program, the exact structure behind the
  picture. Use it to check arrow kinds, guards and order. Judge the look from
  the PNG only.

Judge the diagram against the brief and against what a careful engineer
would draw. Do not judge the brief itself. Score each category on its own:
a fault counts once, in the category it belongs to.

## Program notation

- `participant N text=<name>` declares column N, left to right. `label=` is
  the shown name, `kind=actor` draws a stick figure.
- `A > B` is a sync call, `A -> B` an async message, `A --> B` a return
  (dashed).
- `alt guard=… / else`, `opt guard=…` and `loop guard=…` are fragments.
  Indentation shows what is inside.
- `note over=N`, `left=N` or `right=N` is a note.

## Categories

### Meaning

**systemFidelity**: the flow matches the system the brief describes. Each
arrow has the right kind: a sync call where the caller waits, async where it
does not, a return where a reply comes back. Fragment kinds and guards say
the right condition (`alt` for a choice, `opt` for an optional step, `loop`
for repetition).

- 10: Every arrow, kind, direction and guard is right. An expert in the
  system finds nothing to correct.
- 8: The flow is right, with one small slip, such as one return drawn as an
  async message or one guard worded loosely.
- 5: The main path is right, but several arrow kinds are wrong, or one
  fragment has the wrong kind or guard.
- 2: The flow misstates the system: wrong order, wrong receiver, or a
  fragment that says the opposite of the truth.

**requirementCoverage**: every step the brief requires is on the diagram.

- 10: Every required participant, message, return, fragment and note is
  present.
- 8: One minor required detail is missing, such as one return or one note.
- 5: A required branch, loop or several required messages are missing.
- 2: Most of what the brief asks for is missing.

**scopeDiscipline**: the diagram adds nothing the brief does not ask for or
clearly imply.

- 10: Nothing extra. Every participant and message traces to the brief.
- 8: One small addition, such as an extra note or an unrequested return label
  detail.
- 5: Several additions, or one extra participant or branch.
- 2: The diagram is padded with invented steps or participants that bury the
  requested flow.

### Look

**readability**: a new viewer follows the flow at arm's length, top to
bottom, without the brief.

- 10: The story reads at a glance. The eye never hunts for the next step.
- 8: It reads well, with one spot where the eye must stop to work out the
  order.
- 5: The viewer must trace arrows one by one to follow it.
- 2: The flow cannot be followed without the program text.

**participantOrder**: the column order keeps most arrows short and moving
left to right.

- 10: The first caller is leftmost. Calls flow right and returns flow left.
  No arrow skips a column it could avoid.
- 8: One arrow is longer than it needs to be, or one call flows right to
  left without reason.
- 5: Several arrows cross extra columns, or the order fights the flow.
- 2: The order looks arbitrary. Most arrows are long or run backward.

**rhythmAndFragments**: rows have a steady rhythm, and frames, guards and
activation bars read clearly.

- 10: Rows are evenly spaced. Frames sit apart and enclose exactly their
  steps. Guards and activation bars are unambiguous.
- 8: One spot is cramped or loose, or one frame edge is close to a label.
- 5: Rhythm is uneven, or a frame, guard or activation bar is hard to read.
- 2: Frames overlap or cut through steps. The structure cannot be read.

**colorAndContrast**: color carries meaning, and all text is legible.

- 10: Each color marks one kind of thing, consistently. Every label has
  strong contrast with what is behind it.
- 8: Color is consistent, with one element whose color adds no meaning or
  one label with weak contrast.
- 5: Color is decorative or inconsistent, or several labels are hard to
  read.
- 2: Color misleads, or text is illegible against its background.

**typographyAndLabels**: labels are short, never clipped, and never cross a
lifeline or another label.

- 10: Every label is short and complete, sits clear of lines and other
  text, and uses one consistent naming style.
- 8: One label is long or wordy, or one label touches a line.
- 5: Several labels are long, crowded or crossed by lifelines, or one is
  clipped.
- 2: Labels are clipped, overlap each other, or cannot be read.

**craft**: the diagram looks finished and ready to put in a doc.

- 10: Nothing to fix. Proportions, spacing, title and alignment look
  deliberate.
- 8: Ready to ship with one small polish item, such as empty space or a
  missing title.
- 5: Needs a pass before it goes in a doc: several rough spots.
- 2: Looks broken or unfinished.

## Return

Return only this JSON object, with no text before or after it. Each score is
an integer from 1 to 10. Give one finding per fault you saw, in the
category it belongs to. An empty `findings` list is valid.

```json
{
  "judge": "<your judge name>",
  "brief": "<brief slug>",
  "scores": {
    "systemFidelity": 0,
    "requirementCoverage": 0,
    "scopeDiscipline": 0,
    "readability": 0,
    "participantOrder": 0,
    "rhythmAndFragments": 0,
    "colorAndContrast": 0,
    "typographyAndLabels": 0,
    "craft": 0
  },
  "findings": [
    { "category": "craft", "severity": "high", "text": "<what is wrong and where>" }
  ]
}
```

`severity` is `high`, `medium` or `low`. `category` is one of the nine
category keys above.
