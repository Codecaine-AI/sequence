import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@codecaine-ai/text-measure/fonts.css";
import { useBrowserFonts } from "@codecaine-ai/text-measure/browser";
import { App } from "./App";
import "./index.css";

/**
 * Diagrams measure text with the bundled Inter faces (fonts.css). Loading
 * them before the first render lays every diagram out once, with exact
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
