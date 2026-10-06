import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const STUDIO_DIR = dirname(fileURLToPath(import.meta.url));
const resolveFrom = createRequire(import.meta.url);
// @codecaine-ai/design-system sits outside this workspace (Core links it), so
// the dev server must be allowed to serve its fonts and stylesheets.
const DESIGN_SYSTEM = dirname(resolveFrom.resolve("@codecaine-ai/design-system/package.json"));
// @codecaine-ai/text-measure lives in the canvas repo, outside this
// workspace: useBrowserFonts falls back to its font files for any face the
// page does not declare.
const TEXT_MEASURE_FONTS = resolve(
  dirname(resolveFrom.resolve("@codecaine-ai/text-measure/fonts.css")),
  "fonts",
);

export default defineConfig({
  appType: "spa",
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(STUDIO_DIR, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: 3998,
    fs: {
      allow: [searchForWorkspaceRoot(STUDIO_DIR), DESIGN_SYSTEM, TEXT_MEASURE_FONTS],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3998,
  },
});
