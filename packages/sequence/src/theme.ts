import type { CSSProperties } from "react";

import type { SequenceStyle } from "./schema";

export const SEQUENCE_CSS_VARIABLES = {
  accent: "--seq-accent",
  fragmentAccent: "--seq-fragment-accent",
  participantFill: "--seq-participant-fill",
  text: "--seq-text",
  muted: "--seq-muted",
  background: "--seq-bg",
} as const;

export const SEQUENCE_THEME_DEFAULTS = {
  accent: "#C77D2E",
  fragmentAccent: "#5B7FBD",
  participantFill: "#FFF8F0",
  text: "#252525",
  muted: "#9AA0A6",
  background: "#FFFFFF",
} as const;

// Short aliases are convenient when these objects are used as token maps.
export const SEQUENCE_CSS_VARS = SEQUENCE_CSS_VARIABLES;
export const DEFAULT_SEQUENCE_THEME = SEQUENCE_THEME_DEFAULTS;

/** CSS custom properties contributed by a document's explicit style section. */
export function sequenceStyleToCssVars(style: SequenceStyle): Record<string, string> {
  const variables: Record<string, string> = {};
  if (style.accent !== undefined) variables[SEQUENCE_CSS_VARIABLES.accent] = style.accent;
  if (style.fragmentAccent !== undefined) {
    variables[SEQUENCE_CSS_VARIABLES.fragmentAccent] = style.fragmentAccent;
  }
  if (style.participantFill !== undefined) {
    variables[SEQUENCE_CSS_VARIABLES.participantFill] = style.participantFill;
  }
  return variables;
}

/** React-friendly equivalent of {@link sequenceStyleToCssVars}. */
export function sequenceStyleToReactStyle(style: SequenceStyle): CSSProperties {
  return sequenceStyleToCssVars(style) as CSSProperties;
}
