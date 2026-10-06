import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useBrowserFonts } from "@codecaine-ai/text-measure/browser";
import { App } from "./App";
import "./index.css";

/**
 * Diagrams measure text with the bundled Inter faces. index.css declares them
 * through @codecaine-ai/design-system/fonts.css (the same woff2 files as
 * text-measure's), and useBrowserFonts loads the page's @font-face rules.
 * Loading them before the first render lays every diagram out once, with exact
 * widths. SequenceViewer lays out again by itself on any later backend
 * switch; if loading fails, layout keeps text-measure's advance table.
 */
async function start(): Promise<void> {
  const { backend, reason } = await useBrowserFonts({ timeoutMs: 5_000 });
  if (reason) console.warn(`Sequence Studio: text measurement stays on the ${backend} backend: ${reason}`);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
