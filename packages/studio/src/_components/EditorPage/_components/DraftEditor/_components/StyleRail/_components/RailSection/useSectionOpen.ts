import { useState } from "react";

// v2: bumped when the color controls were hidden, so no open-state saved by
// the old rail carries over.
const SECTION_KEY_PREFIX = "sequence-studio.styleRail.v2.section:";

function readSectionOpen(id: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(`${SECTION_KEY_PREFIX}${id}`);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function writeSectionOpen(id: string, open: boolean): void {
  try {
    window.localStorage.setItem(`${SECTION_KEY_PREFIX}${id}`, String(open));
  } catch {
    // Session-only state when storage is unavailable.
  }
}

/** A rail section's open state, persisted per section id (open by default). */
export function useSectionOpen(id: string): [open: boolean, toggle: () => void] {
  const [open, setOpen] = useState(() => readSectionOpen(id, true));
  const toggle = () =>
    setOpen((previous) => {
      writeSectionOpen(id, !previous);
      return !previous;
    });
  return [open, toggle];
}
