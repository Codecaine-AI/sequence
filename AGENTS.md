# Agent notes

## Test commands
Run every command from the repo root. This repo sits inside the Codecaine core workspace (`sequence/packages/*` are core workspace members), so install with `bun install` at the core root, not here. Packages resolve dependencies from core's `node_modules`.

**Tier 1, every change:** `bun run typecheck`, then the focused command for each changed test or its owner: `bun test <file>` from the repo root, for example `bun test packages/sequence/src/__tests__/layout.test.ts`.

**Tier 2, before a PR:** there is no changed-files gate and no CI. Diff base: `origin/main`. Run the full suite of every area the diff touches:

| Area | Owns | Command | Size, wall time |
|---|---|---|---|
| `packages/sequence` | Engine: schema, text language, layout, SVG render, lints, agent operations, writing guide | `bun test packages/sequence/src` | 9 files, 127 tests, under 1 s |
| `packages/climb` | Hill-climb scorer and judge (`bun run climb`) | `bun test packages/climb/src` | 2 files, 25 tests, under 1 s |
| `packages/studio` | Studio UI | no tests; `bun run typecheck:studio` | none |

Routing rules:
- A change in `packages/sequence/src` runs sequence and climb, plus `bun run typecheck` (studio imports the engine).
- Other core packages import `@codecaine-ai/sequence` (`/schema`, `/language`, `/agent-schema`): `docs-system` (docs-server, docs-mcp, docs-model, docs-workbench, external/sequence) and `canvas/tools/docs-framework`. A change to an exported API also runs their suites.
- A change only in `docs/`, `design-reference/` or `*.md` runs no tests.

**Tier 3, before a big merge:** `bun run typecheck` and `bun run test`.

**Keeper tests:** these are the only proof of a user flow. A prune must keep them, test by test.

| Flow | Keeper |
|---|---|
| An agent rewrites the program and the document keeps its style and id | `packages/sequence/src/__tests__/agent.test.ts` "setProgram replaces structure while preserving style and id" |
| Every fixture program round-trips byte for byte | `packages/sequence/src/__tests__/language.round-trip.test.ts` "<fixture> is byte-identical after parse" |
| A bad program is refused with line-numbered errors | `packages/sequence/src/__tests__/agent.test.ts` "invalid programs surface line-numbered errors" |
| A document renders to standalone SVG | `packages/sequence/src/__tests__/render.test.tsx` "renders fixture labels in standalone SVG markup" |
| A climb run scores rounds and gates the newest | `packages/climb/src/score.test.ts` "writes a table with a column per round and gates the newest round" |

**Known failures on main:** none.

**Quarantine:** none. Each entry needs the test title, an owner and an expiry date.
