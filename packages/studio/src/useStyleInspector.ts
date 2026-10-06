import { useCallback, useRef, useState } from "react";

const STYLE_OPEN_KEY = "sequence-studio.showStyle";

function readStyleOpenPreference(): boolean {
  try {
    return window.localStorage.getItem(STYLE_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeStyleOpenPreference(open: boolean): void {
  try {
    window.localStorage.setItem(STYLE_OPEN_KEY, String(open));
  } catch {
    // A blocked localStorage should not break the toggle for this session.
  }
}

/**
 * The Style inspector's open state. Stored only on an explicit toggle; open
 * when nothing is stored. closeStyle also returns focus to the Style toggle
 * (styleToggleRef).
 */
export function useStyleInspector() {
  const [styleOpen, setStyleOpen] = useState(readStyleOpenPreference);
  const styleToggleRef = useRef<HTMLButtonElement>(null);

  const changeStyleOpen = useCallback((open: boolean) => {
    setStyleOpen(open);
    writeStyleOpenPreference(open);
  }, []);

  // Closing from inside the inspector (its close button, or Escape there or in
  // the rail) returns focus to the Style toggle. The shell's inspector returns
  // focus only to an opener it saw open the panel, and the editor mounts with
  // the panel already open.
  const closeStyle = useCallback(() => {
    changeStyleOpen(false);
    styleToggleRef.current?.focus({ preventScroll: true });
  }, [changeStyleOpen]);

  return { styleOpen, styleToggleRef, changeStyleOpen, closeStyle };
}
