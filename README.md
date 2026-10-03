# Codecaine Sequence

A sequence-diagram engine (`@codecaine-ai/sequence`) plus a standalone studio
UI (`@codecaine-ai/sequence-studio`) for authoring and previewing UML 2.x
sequence diagrams.

The JSON `SequenceDocument` is the source of truth. Its compact text program is
a disposable, agent-facing projection: the engine serializes a document, an
agent rewrites the whole program, and the parser replaces the document's
structure while preserving its separately managed style. Deterministic layout
then expands that structure into geometry for SVG rendering; the language
contains no coordinates, styling, internal ids, or activation commands.

## Default Diagram Appearance

Participants appear in matching rows at the top and bottom, in document order.
Dashed lifelines connect the two rows; activation bars stay within the event
area. Message spans expand to fit their labels. Combined fragments retain UML
operator tabs, bracketed guards, and dashed operand dividers; guard and message
text renders over lifelines and activation bars for readability. Notes wrap
inside their box and keep clear of neighbouring lifelines, and long titles wrap
at the diagram width. SVG text asks for Inter first (`SEQUENCE_TYPOGRAPHY`).
Layout measures each text in the font it is drawn in with
`@codecaine-ai/text-measure`, so hosts load its bundled fonts: `useHarfBuzz()`
in Bun / Node, `fonts.css` plus `useBrowserFonts()` in a browser.

Measurement limits:

- Headless exports must call `useHarfBuzz()` before layout. The default
  advance table can break a rare ASCII contextual pair (such as `K<>r`)
  differently and move a line break.
- A host that restyles text with `--seq-font-family` must pass a measurer for
  that font (the `measure` prop, or `layoutSequence`'s second argument).
  Layout otherwise measures Inter.
- Bidirectional text, including bidi controls such as U+202E, is measured in
  logical order, so its widths can be off by a few pixels.
- Code points XML 1.0 forbids, such as C0 controls other than tab and line
  feed, are dropped from labels before layout, and the SVG renderer drops
  them too, so an exported SVG always parses.
- If text-measure's line breaking fails, for example because another library
  initialized Pretext first, notes and titles break greedily over measured
  widths and the console prints one warning.

These defaults apply to both the React viewer and exported SVGs. Existing
sequence documents need no migration.

## Layout

| Path | Purpose |
|------|---------|
| `packages/sequence/` | `@codecaine-ai/sequence` — schemas, text language, deterministic layout, SVG/React render surfaces, agent operations, themes, and fixtures. |
| `packages/studio/` | `@codecaine-ai/sequence-studio` — a minimal Vite+React editor with live parsing, previews, drafts, and a separate style panel. |
| `docs/` | Architecture overview, complete language reference, and provenance notes. |
| `design-reference/` | UML 2.x sequence-diagram reference images used to guide the visual vocabulary. |

## Getting started

```bash
(cd .. && bun install)   # from the Core root: text-measure lives in canvas/
bun test packages/sequence/src
bun run dev:studio
```

The studio runs at [http://localhost:3998](http://localhost:3998).

Start with [`docs/00-overview.md`](docs/00-overview.md) for the architecture
map and [`docs/LANGUAGE.md`](docs/LANGUAGE.md) for the complete program grammar.
