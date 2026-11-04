/**
 * Bun preload: every process that loads it runs THIS checkout's
 * packages/sequence/src in place of whatever copy of `@codecaine-ai/sequence`
 * it resolves (docs-system's external/sequence submodule, or the sibling
 * checkout its node_modules links to).
 *
 * Bun runtime plugins do not see bare package imports from files on disk,
 * so the overlay works one level lower: `onLoad` replaces each source file of
 * any other `packages/sequence/src` with a one-line re-export of the same
 * file here. Files of this checkout load as themselves and import each other
 * relatively, so each module exists once. A file the other copy has and this
 * checkout lacks loads unchanged.
 *
 * `climb draw` sets `BUN_OPTIONS=--preload <this file>` on the docs MCP
 * server, and the server passes its environment to the docs daemon it spawns.
 * With CLIMB_OVERLAY_LOG set, each replaced file is logged there, so the
 * caller can prove the overlay ran.
 */
import { plugin } from "bun";
import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const OWN_SRC = realpathSync(resolve(import.meta.dir, "../../sequence/src"));
const MARKER = `${sep}packages${sep}sequence${sep}src${sep}`;
const LOG = process.env.CLIMB_OVERLAY_LOG;

const loaderFor = (path: string) => (path.endsWith(".tsx") ? "tsx" : "ts");

plugin({
  name: "climb-sequence-overlay",
  setup(build) {
    build.onLoad({ filter: /[\\/]packages[\\/]sequence[\\/]src[\\/].+\.tsx?$/ }, (args) => {
      const original = args.path;
      const own = original.startsWith(`${OWN_SRC}${sep}`);
      const relativePath = original.slice(original.lastIndexOf(MARKER) + MARKER.length);
      const replacement = join(OWN_SRC, relativePath);
      if (own || !existsSync(replacement)) {
        return { contents: readFileSync(original, "utf8"), loader: loaderFor(original) };
      }
      if (LOG) appendFileSync(LOG, `${process.pid} ${original} -> ${replacement}\n`);
      return { contents: `export * from ${JSON.stringify(replacement)};\n`, loader: "ts" };
    });
  },
});
