# Project state — where sequence is and how it got here

_Last updated: 2026-07-21. This doc is the session handoff for the sequence project: what exists, why it's shaped this way, and how to pick the work back up._

## What this is

`sequence` is the dedicated sequence-diagram system for the Codecaine docs family. It replaces the mermaid block in docs-system (mermaid is disliked and being retired; every non-sequence diagram belongs to the canvas system instead). It is a standalone mini-repo mirroring how `canvas` is set up: raw-TS workspace packages, a studio playground app, and consumption by docs-system through a git submodule + host-injected embed seam.

## Core architecture decisions (settled — don't relitigate without Ford)

1. **The JSON `SequenceDocument` is the single source of truth.** Not the text language.
2. **The text program is a disposable agent-facing projection.** `serializeSequenceProgram(doc)` emits it fresh; an agent rewrites the *whole program* (no patch-DSL); `parseSequenceProgram` validates with line-numbered errors. Conventions inherited from canvas layout-lab v3 (`canvas/apps/layout-lab/LANGUAGE.md`): clarity over compression, every value labeled, 2-space indent is the only nesting, **numbers are participant identity**, `text=` is a display name, byte-exact round-trip.
3. **The language carries no styling, no coordinates, no ids, no activations.** Layout is a pure deterministic function of structure (single measure-and-place pass: participants → columns, items → rows). Activations are derived (sync call activates receiver until the matching return, cross-operand aware).
4. **Styling is fully separated** in `document.style`: four quick shortcuts (`accent`, `fragmentAccent`, `participantFill`, `scale`) plus per-element groups (`surface`, `participant`, `lifeline`, `message`, `activation`, `fragment`, `note`) covering colors, opacity, padding, and spacing. Precedence: per-element > shortcut > CSS var (`--seq-*`) > default. `setStyle` deep-merges one level; explicit `null` clears.
5. **Visual vocabulary is real UML 2.x** per the reference images in `design-reference/` (pentagon fragment tabs, guards, activation bars, sync `>` / async `->` / return `-->` arrowhead semantics, folded-corner notes, actor glyphs, stereotypes).
6. **Agent ops are canvas-style**: `SEQUENCE_AGENT_PATCH_OPERATIONS` (`setProgram` / `setStyle` / `setTitle`) in TypeBox with compile-time sync asserts, lifted into docs-model with `forward: { authority: "sequence" }`. docs-model may import only the `agent-schema` leaf (enforced by docs-system's `import-boundaries.test.ts`).

## What has been done (all pushed to `main` here; docs-system side uncommitted in Ford's tree)

**This repo** (commits `968cc99` → `d1ede82`):
- `packages/sequence` (`@codecaine-ai/sequence`): schema + TypeBox validation; language parser/serializer with byte-exact round-trip and multi-error line-numbered diagnostics; deterministic layout (`SEQUENCE_LAYOUT` constants, injectable text measurement, derived activations); SVG renderer (`SequenceViewer`, `renderSequenceSvgString`) themed via CSS vars; agent ops + actions; theme helpers; fixtures (`loginFlow`, `combinedFragments`, `minimal`); 58 tests.
- `packages/studio` (`:3998`): canvas-studio-style two-view app — gallery (live-thumbnail cards for fixtures + localStorage drafts) → editor (360px program sidebar with Format + line-numbered errors, dominant dot-grid centered preview, top bar with back/rename/save-state) — plus a 320px **StyleRail** matching the docs-system rail (Colors/Layout pill tabs, collapsible per-element sections, swatch+hex / opacity sliders / px sliders, per-section reset, all through `setStyle`).
- Layout quality passes, screenshot-verified against the reference images: fragment frames span all involved columns; guards measured into frame width; cross-operand activation matching; and the **vertical rhythm pass** (`FRAG_MARGIN_Y: 24`, `FRAG_INNER_TOP/BOTTOM`, `FRAG_DIVIDER_GAP`, `FRAG_GUARD_H` guard band, `NOTE_MARGIN_Y`, `ROW_H` 40) so frames stand clearly apart — Ford's "clear separation like the framed reference images" feedback.
- `docs/` (LANGUAGE.md grammar spec, 00-overview.md, PROVENANCE.md), README, Makefile (`studio`/`test`/`typecheck`/`docs` on :4811), MIT license.

**docs-system integration** (working tree only — Ford commits when ready):
- Submodule at `external/sequence` + root workspace entry `external/sequence/packages/*`.
- `sequence` block type registered atomically: docs-model component (`components/sequence/` — sidecar-reference state `{sequenceId?, src?, title?}`, agent-view comment projection, lifted `sequence.*` ops), docs-viewer seam (`SequenceEmbedProps` / `sequenceEmbed` provider prop / `useSequenceEmbed` / fallback; descriptor + `docSequence` editor node), registry/schema/node-view registrations, import-boundary rule.
- docs-server: `sequence-sidecar.ts` (sidecars at `docs/assets/sequences/*.sequence.json`, hash-precondition/draft-lock/atomic-write), forwarded ops through `POST /api/ops`, `GET/PUT/POST/DELETE /api/sequence` + `/api/sequence-by-doc`, patch ledger + undo, `sequence_get`/`sequence_apply_patch` agent tools; 19 new route tests.
- docs-workbench: `StandaloneSequenceEmbed` injected via `DocsClientProvider`, `__SEQUENCE_STUDIO_URL__` define (default `http://localhost:3998`), "Open in Sequence Studio" affordance.
- Content: vocab doc `docs/10-system-design/40-block-vocabulary/60-sequence/` (replaced the mermaid vocab doc; live login-flow block + two example programs + retirement callout); `docs/20-implementation/10-packages/doc.json` "Sequence examples" section with three live blocks (`agent-edit-flow` and `viewer-host-seam` — accurate diagrams of this system's own pipelines — plus `order-distribution`); goldens regenerated. Verified rendering end-to-end with screenshots.
- Test state at handoff: docs-model+viewer 800/2 (the 2 = pre-existing ENOENT goldens from Ford's in-flight docs renumbering, unrelated), docs-server 127/0, workbench unchanged baseline.

## Known loose ends

- **Mermaid removal from docs-system is NOT done** — the block type is still registered everywhere; the vocab *doc* was replaced but `MermaidDocsBlock`, the `mermaid@^11` dependency (big transitive tree), registry entries, theme vars, and two flowchart blocks in content remain. Removal must be atomic across `DOC_BLOCK_TYPES` + all four registries.
- Studio has no `/embed/:id` route or `preview.svg` endpoint (canvas studio has these; workbench currently shows a link instead of an inline iframe for id-only blocks).
- No SlashMenu entry for inserting a sequence block in the docs editor (deliberately deferred).
- Sequence sidecars aren't indexed for backlinks (canvas has an indexer; sequence doesn't yet).
- v2 language/feature candidates: `par`/`break` fragments, `ref` interaction-use, create/destroy lifelines, duration constraints, self-message polish, autonumbering.
- docs-system quirks noticed en route (not sequence's): deep-linked doc URLs 404 their SPA bundle (relative asset paths); `docs/10-system-design/doc.json` lost its opening paragraph during Ford's docs renumbering.
- Ops notes: `codex exec` wedged twice on long xhigh tasks (watchdog: no file writes in 15–20 min → kill); direct Fable-agent edits were explicitly authorized by Ford for this workstream.

## Continuation message

> We're building `sequence` (github.com/Codecaine-AI/sequence, sibling checkout at `Codecaine/sequence`, submodule at `docs-system/external/sequence`). Read `STATE.md` at its repo root — it has the settled architecture (JSON doc is source of truth; text program is a disposable agent projection; styling separate and per-element; UML 2.x visuals per `design-reference/`) and the full done/not-done ledger. The engine, studio (gallery + editor + StyleRail on :3998), and the docs-system integration (block type, server sidecars/ops, workbench embed, live examples in the vocab doc and 10-packages doc) are all working and screenshot-verified; docs-system changes are sitting uncommitted in Ford's tree. Next candidates, in rough priority: (1) atomic mermaid removal from docs-system (drop the block type from `DOC_BLOCK_TYPES` + all four registries, delete both component dirs, drop the `mermaid@^11` dep, migrate the two remaining flowchart blocks to canvas or prose, regenerate goldens); (2) studio `/embed/:id` + `preview.svg` so workbench can inline-embed like canvas does; (3) SlashMenu insert entry + a nicer editor node view for sequence blocks; (4) v2 fragments (`par`/`break`/`ref`). Verify UI work with real screenshots (the studio runs at :3998; a docs serve can run at :4805), keep the language/round-trip byte-exact, and don't grow the block vocabulary without Ford.

