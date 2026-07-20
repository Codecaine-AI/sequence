# Sequence architecture

Sequence is a sequence-diagram engine (`@codecaine-ai/sequence`) plus a
standalone studio (`@codecaine-ai/sequence-studio`). Its JSON
`SequenceDocument` is the source of truth. The text language is a compact,
disposable projection for agents: serialize the current document, rewrite the
whole program, parse it, then replace the document structure while preserving
its separately managed style.

The engine follows one deterministic path:

```text
SequenceDocument (JSON source of truth)
  │
  ├─ serializeSequenceProgram ─→ disposable text projection
  │                                  │
  │                             whole-program agent rewrite
  │                                  │
  │                         parseSequenceProgram
  │                                  │
  │                    validated replacement structure
  │                     + preserved document style/id
  │                                  │
  └────────────────────────────────────────┘
                         │
                   layoutSequence
             deterministic geometry only
                         │
                    SVG rendering
                         │
          SequenceViewer / standalone SVG string
```

Structure flows into layout; coordinates never flow back into the document or
language. `layoutSequence` is pure and DOM-free, and an injectable text
measurement function keeps its output deterministic in tests and hosts.
Rendering consumes the resulting geometry without becoming a second layout
engine.

## Inherited layout-lab conventions

The language carries forward the canvas layout-lab v3 approach:

- **JSON remains authoritative.** The program is an agent-facing view, not a
  second persistence format.
- **Rewrites replace the whole program.** There is no text patch DSL. Parsing
  either produces a validated replacement structure or line-numbered errors.
- **Numbers are identity.** Participants are declared densely as `1..n`, in
  column order, and every message or note refers to those numbers.
- **Structure goes in; geometry comes out.** Two-space indentation expresses
  nesting. No position, size, path, or other coordinate appears in the text.
- **Style is fully separated.** Colors and scale live in
  `SequenceDocument.style`; serialization never emits them, and a program
  rewrite preserves the existing style.
- **Expansion is deterministic.** Parsing regenerates stable internal ids and
  layout derives rows, frames, lifelines, arrow docking, notes, and activation
  bars from structure alone.

This separation keeps programs readable to an agent while allowing the JSON
document and renderer to retain richer engine concerns. In particular,
activations are inferred from synchronous calls and returns rather than stated
in the grammar.

## Package map

| Path | Package | Responsibility |
|------|---------|----------------|
| `packages/sequence` | `@codecaine-ai/sequence` | Public schema and validation, canonical language parser/serializer, deterministic layout, SVG rendering and React embed surface, agent operations, theme mapping, and fixtures. |
| `packages/studio` | `@codecaine-ai/sequence-studio` | Minimal Vite+React workbench for editing programs, seeing line-numbered parse errors, previewing the last valid document, managing local drafts, and changing style independently of text. |
| `docs` | — | Architecture, language reference, and provenance. |
| `design-reference` | — | UML 2.x visual references used to establish the notation and rendering vocabulary. |

The engine is a raw-TypeScript workspace package with granular exports for the
schema, language, layout, agent schema, and theme. The studio is a consumer of
that public surface, not a privileged rendering or parsing implementation.

## Future docs-system integration

The intended docs-system integration keeps the same narrow boundaries:

```text
docs host
  ├─ external/sequence             sequence repository as a submodule
  ├─ agent-schema-only boundary   operations exposed to the docs model
  └─ host-injected embed          host supplies document/state plumbing
       └─ SequenceViewer          engine-owned read-only SVG surface
```

The docs model should see only the agent operation schema: rewrite the complete
program with `setProgram`, adjust presentation with `setStyle`, or set the title
explicitly. It should not depend on studio state, renderer internals, or layout
coordinates. The host owns persistence and injects the current document into
the embed; Sequence owns validation, deterministic expansion, and drawing.

That arrangement permits the repository to live at `external/sequence` without
coupling the docs system to Sequence's workspace tooling or editor UI. It also
preserves the core invariant across standalone and embedded use: JSON is the
source of truth, text is disposable, and styling stays outside the language.
