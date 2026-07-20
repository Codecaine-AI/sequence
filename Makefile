.PHONY: studio test typecheck docs

# Run the Vite studio development server on port 3998.
studio:
	bun install
	bun run dev:studio

test:
	bun test packages/sequence/src

typecheck:
	bun run typecheck

# Serve this repo's docs/ on port 4811 — off the usual docs ports
# (4800–4804) so it never collides with a running docs-system app.
# Prefers the LIVE sibling docs-system checkout (dogfooding: uncommitted
# viewer/theme work fans out here; the SPA staleness check rebuilds on each
# boot), falling back to the vendored tools/docs-framework submodule. The
# shared theme comes from the themes -> ../docs-system/themes symlink,
# and --theme-locked keeps this serve a pure consumer of it: the repo
# default theme always applies, the style rail is hidden, and theme writes
# are refused — tuning happens ONLY in the primary docs-system app.
# Single-port mode: API + viewer SPA together; doc.json edits are picked up
# live via fs-watch (--dev is only for hacking on the viewer SPA itself,
# and spawns vite on an uncontrolled second port).
DOCS_SYSTEM ?= ../docs-system
docs:
	@if [ -f "$(DOCS_SYSTEM)/packages/docs-cli/src/index.ts" ]; then \
		echo "docs: serving with live checkout $(DOCS_SYSTEM)"; \
		bun "$(DOCS_SYSTEM)/packages/docs-cli/src/index.ts" serve --root docs --port 4811 --theme-locked; \
	else \
		echo "docs: live checkout not found, using vendored tools/docs-framework"; \
		bun tools/docs-framework/packages/docs-cli/src/index.ts serve --root docs --port 4811 --theme-locked; \
	fi
