import type { RailTab } from "./types";

/** Owner decision: style engines hide their color controls (and keep the code). */
export const SHOW_COLOR_CONTROLS = false;

export const RAIL_TABS: readonly RailTab[] = SHOW_COLOR_CONTROLS ? ["colors", "layout"] : ["layout"];
