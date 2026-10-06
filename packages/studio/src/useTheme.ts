import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** localStorage key of the theme choice. index.html reads it before the first paint. */
export const THEME_STORAGE_KEY = "sequence-studio.theme";

/**
 * The page theme: `data-theme` on `<html>`, which tokens.css and every
 * `--ds-*` alias in index.css follow. index.html sets it from storage before
 * the first paint (light when nothing is stored). The attribute is the source
 * of truth, so the toggle also follows a theme set from outside the app; only
 * an explicit choice is written to storage.
 */
export function useTheme(): { theme: Theme; setTheme: (next: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as const);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Blocked storage: the choice lasts until the page reloads.
    }
  }, []);

  return { theme, setTheme };
}

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
