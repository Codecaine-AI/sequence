import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const STUDIO_DIR = dirname(fileURLToPath(import.meta.url));
// @codecaine-ai/text-measure lives in the canvas repo, outside this
// workspace, so the dev server must be allowed to serve its font files.
const TEXT_MEASURE_FONTS = resolve(
  dirname(createRequire(import.meta.url).resolve("@codecaine-ai/text-measure/fonts.css")),
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
      allow: [searchForWorkspaceRoot(STUDIO_DIR), TEXT_MEASURE_FONTS],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3998,
  },
});
