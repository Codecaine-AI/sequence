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
text renders over lifelines and activation bars for readability.

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
bun install
bun test packages/sequence/src
bun run dev:studio
```

The studio runs at [http://localhost:3998](http://localhost:3998).

Start with [`docs/00-overview.md`](docs/00-overview.md) for the architecture
map and [`docs/LANGUAGE.md`](docs/LANGUAGE.md) for the complete program grammar.
