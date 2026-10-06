import { createContext } from "react";

/** The in-memory router's navigate: App provides it, NavButton calls it. */
export const NavigateContext = createContext<(path: string) => void>(() => undefined);
