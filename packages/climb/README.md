# @codecaine-ai/climb

Tools for a sequence-diagram quality climb. One draw runs a set of briefs
through four steps:

1. `climb setup` makes a scratch docs project with one empty sequence block
   per brief.
2. `climb draw` has Opus 5.5 draw each brief headless, through the
   docs-system MCP only.
3. `climb render` turns each drawn sidecar into a PNG, an SVG, a program and
   metrics.
4. `climb judge` has each judge score each PNG with `judge-brief.md`.

One round is 3 draws of the same code: drawer noise is too large for one
draw. Two draws of the same code moved a category mean by up to 1.17.
`climb score` turns a round's score files into a gate verdict and a table.

Run it from the repo root as `bun run climb <command>` or
`bun packages/climb/src/cli.ts <command>`. It runs raw TypeScript with Bun.

## Commands

```
climb round  --briefs <dir> --run <runDir> --judges <sol,opus,...> [--draws 3] [--concurrency 4] [--judge-concurrency 6] [--timeout-min 20]
climb setup  --briefs <dir> --run <runDir>
climb draw   --run <runDir> [--concurrency 4] [--timeout-min 20] [--only a,b]
climb render --run <runDir> [--only a,b]
climb judge  --run <runDir> --judges <sol,opus,...> --out <scoresDir> [--concurrency 6] [--only a,b]
climb score  --scores <round> [--scores <round> ...] --set <climb|held-out> --judges <a,b,...> --out <dir> [--briefs <dir>] [--draws 3] [--exempt-floor <brief>:<category> ...]
```

### One round of 3 draws

1. Run the round:

   ```
   bun run climb round --briefs <dir> --run packages/climb/runs/<name> --draws 3 --judges sol,opus
   ```

2. Score it:

   ```
   bun run climb score --scores packages/climb/runs/<name> --set climb --judges sol,opus --exempt-floor status-poll:participantOrder --out packages/climb/runs/<name>/score
   ```

   Ford exempted `status-poll` / `participantOrder` from the floor. The flag
   is the only record of that: score has no built-in exemptions.

`climb round` runs setup, draw, render and judge for `draw-1`, then
`draw-2`, then `draw-3`. Each `<runDir>/draw-<n>` has the single-draw
layout below, with scores in `draw-<n>/scores`. A failed drawer or judge
does not stop the round. Round lists each problem and exits 1. To repair one
draw, run the single-draw commands on its folder, for example
`climb judge --run <runDir>/draw-2 --judges sol --out <runDir>/draw-2/scores --only build-loop`.

Cost: a round costs about 3 times one draw, in drawer and judge tokens and
in time. The draws run one after another. For 6 briefs and 2 judges, a round
is 18 drawer runs and 36 judge runs.

Put round folders under `packages/climb/runs/`. Git ignores that folder.
Briefs come in by `--briefs`. Keep brief sets outside this repo, except the
smoke fixture.

### setup

`<dir>` holds `<slug>/brief.md` folders. A slug is lowercase letters, digits
and dashes. Setup writes this layout and removes an older round's output
first:

```
<runDir>/
  round.json                     git commit (and dirty flag), sha256 of packages/sequence/skills/sequence, briefs
  project/codecaine.docs.json    scratch docs project
  project/docs/<slug>/doc.json   one page, one empty sequence block b-<slug>-sequence
  project/docs/<slug>/assets/sequences/<slug>.sequence.json   empty sidecar
  <slug>/brief.md                copy of the brief
```

The skill hash covers every file's relative path and content, so two rounds
with the same hash gave the drawer the same skill text.

### draw

Each brief gets one `claude -p` run:

- `--model claude-opus-5-5 --effort medium --output-format stream-json --verbose`
- `--mcp-config <runDir>/draw/mcp-config.json --strict-mcp-config`: only the
  docs-system MCP, started with `--workspace <runDir>/project`.
- `--append-system-prompt-file <runDir>/draw/system-prompt.md`: SKILL.md and
  every file in `references/`.
- `--tools Read` and `--allowedTools mcp__docs-system "Read(/<renders>/**)"`:
  the only built-in tool is `Read`, and it reaches only the SVGs that the docs
  daemon renders.
- `--settings` with `claudeMdExcludes` and `disableAllHooks`: auth and the
  gateway still come from user settings, but no CLAUDE.md and no hook reaches
  the drawer.
- The working folder is the scratch project. Variables of a parent Claude
  Code session are removed.

The prompt (`<slug>/prompt.md`) holds the brief, the page and block to
write, and the three edit tools: `docs_sequence_set_program`,
`docs_sequence_set_title` and `docs_sequence_set_style`. Each run writes
`<slug>/transcript.jsonl`, `<slug>/draw.stderr.log` and `<slug>/draw.json`.

### render

Per brief, render reads the sidecar and writes:

- `diagram.svg`: `renderSequenceSvgString`, laid out with the bundled Inter
  through HarfBuzz.
- `diagram.png`: the SVG in headless Chromium (Playwright) at scale 2. The
  page pins the light-theme `--seq-*` values from `sequenceThemeCssVars`, a
  light page background, 24 px padding and the bundled Inter woff2 files
  inlined as data URLs.
- `program.txt`: `serializeSequenceProgram`.
- `metrics.json`: schema diagnostics, program diagnostics (the program
  parsed back), lint results, diagram counts and size, whether the fonts
  loaded, and the drawer's tool calls (total and per tool), tokens (input,
  output, cache creation, cache read) and cost from the transcript.

Lints have a hook. When `packages/sequence/src/lints/index.ts` exists, it
must export `lintSequence(document)` returning
`{ rule, severity, message, target? }[]`, and render records its results.
Until then the list is empty and `lintsAvailable` is false.

### score

Score files live at `<scores>/<judge>/<slug>.json` and must match
`src/score-schema.ts`. Each `--scores` value is one round and one table
column. A round is one of these:

- a `climb round` folder: its `draw-<n>/scores` folders are the draws.
- a comma list of score folders, one per draw, such as
  `runs/r4-climb/scores,runs/r4b-climb/scores`.
- one score folder: a round of one draw.

`--set` names the brief set for the report. The set's briefs are the folders
of `--briefs` when given, else every brief a judge scored in the newest
round.

A judge's score for a brief in a category is the mean of its scores over the
round's draws. The gate checks the newest round. For each judge and category:

- the mean over the set's briefs must be at least 9.5, and
- no brief's draw mean may be below 9.

`--exempt-floor <brief>:<category>` skips the floor for that cell, for every
judge. The cell still counts in the 9.5 mean. Repeat the flag for more cells.
The brief must be in the set and the category one of the nine keys.

The round must have `--draws` draws (default 3), or it fails. A judge with no
score for a brief in one draw fails. That brief is left out of the means. It
is never averaged over the other draws. Score prints PASS or FAIL with every
failure, exits 0 on PASS and 1 on FAIL, and writes `table.md` and `gate.json`
to `--out`. The table has one row per judge and category and one column per
round. A cell shows the set mean, the lowest brief mean among the briefs the
floor checks, the spread, and each exempt brief's mean after `exempt`. The
spread is max minus min over draws, averaged over briefs. The table's header
and `gate.json` list the exempt cells.

## How the docs server runs this checkout's sequence package

The drawer's edits go through the docs daemon, and the daemon validates and
renders with `@codecaine-ai/sequence`. docs-system resolves that package to
its own copy: the `external/sequence` submodule, or the checkout that the
monorepo's `node_modules/@codecaine-ai/sequence` links to. A climb must
measure this checkout instead. Climb does this without editing docs-system:

1. `src/overlay-preload.ts` is a Bun preload. It registers an `onLoad`
   plugin for every file under any other `packages/sequence/src/`. It
   replaces each such file with `export * from "<this checkout>/packages/sequence/src/<same path>"`.
   This checkout's files load as themselves, so each module exists once.
   (Bun runtime plugins do not see bare package imports from files on disk,
   so `onResolve` cannot do this.)
2. `climb draw` sets `BUN_OPTIONS=--preload <overlay-preload.ts>` in the
   MCP server's environment. The MCP server passes its environment to the
   docs daemon it spawns, so the daemon loads the preload too.
3. `CODECAINE_DOCS_STATE_DIR=<runDir>/draw/docs-state` gives the round its
   own daemon. Draw never reaches the shared daemon, or a daemon that loaded
   another sequence copy. Draw starts the daemon before the first drawer and
   stops it after the last.
4. With `CLIMB_OVERLAY_LOG` set, the preload logs each replaced file. Draw
   refuses to run when the daemon's process replaced no file.

Requirements:

- This checkout must resolve its own dependencies
  (`@codecaine-ai/design-system`, `@codecaine-ai/text-measure`, TypeBox,
  Playwright). In the core monorepo `bun install` at the core root does
  this. In a separate worktree, link `node_modules` to the core root's
  `node_modules`.
- Climb finds docs-system from `CLIMB_DOCS_SYSTEM`, a sibling
  `../docs-system`, or where `@codecaine-ai/docs-mcp` resolves.
- Playwright needs its Chromium build in `~/Library/Caches/ms-playwright`.

## Files

- `src/cli.ts`: the `climb` command.
- `src/run-round.ts`: `climb round`, every step for each draw.
- `src/setup.ts`, `src/draw.ts`, `src/render.ts`, `src/score.ts`: one per
  command.
- `src/score-schema.ts`: the judge score schema (TypeBox).
- `src/transcript.ts`: tool-call and token metrics from a stream-json
  transcript.
- `src/lints.ts`: the lint hook.
- `src/overlay-preload.ts`: the docs-server overlay.
- `judge-brief.md`: what a judge gets and returns.
- `fixtures/smoke/hello/brief.md`: a two-participant smoke brief.
- `fixtures/scores/`: two judge score files for the smoke brief.
