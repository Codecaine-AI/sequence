import type { CSSProperties } from "react";

import type { SequenceStyle } from "./schema";

export const SEQUENCE_CSS_VARIABLES = {
  accent: "--seq-accent",
  fragmentAccent: "--seq-fragment-accent",
  participantFill: "--seq-participant-fill",
  text: "--seq-text",
  muted: "--seq-muted",
  background: "--seq-bg",
  participantStroke: "--seq-participant-stroke",
  participantText: "--seq-participant-text",
  lifeline: "--seq-lifeline",
  message: "--seq-message",
  messageText: "--seq-message-text",
  activationFill: "--seq-activation-fill",
  activationStroke: "--seq-activation-stroke",
  fragmentLabelFill: "--seq-fragment-label-fill",
  fragmentLabelText: "--seq-fragment-label-text",
  noteFill: "--seq-note-fill",
  noteStroke: "--seq-note-stroke",
  noteText: "--seq-note-text",
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

/** Every color knob the renderer paints with, fully resolved for one document. */
export interface SequenceResolvedColors {
  background: string;
  text: string;
  participantFill: string;
  participantStroke: string;
  participantText: string;
  lifelineStroke: string;
  messageStroke: string;
  messageText: string;
  activationFill: string;
  activationStroke: string;
  fragmentStroke: string;
  fragmentLabelFill: string;
  fragmentLabelText: string;
  noteFill: string;
  noteStroke: string;
  noteText: string;
}

const varOr = (name: string, fallback: string): string => `var(${name}, ${fallback})`;

/**
 * Resolve every renderer color for a document. Precedence per knob:
 * per-element style value > shortcut (accent / fragmentAccent /
 * participantFill) > CSS variable > built-in default. Explicit style values
 * become literals; everything else stays a var() chain so host CSS can
 * re-theme the SVG.
 */
export function resolveSequenceColors(style: SequenceStyle): SequenceResolvedColors {
  const vars = SEQUENCE_CSS_VARIABLES;
  const defaults = SEQUENCE_THEME_DEFAULTS;
  const accentChain = varOr(vars.accent, defaults.accent);
  const textChain = varOr(vars.text, defaults.text);
  const mutedChain = varOr(vars.muted, defaults.muted);
  const backgroundChain = varOr(vars.background, defaults.background);
  const pick = (
    perElement: string | undefined,
    shortcut: string | undefined,
    cssVar: string,
    fallback: string,
  ): string => perElement ?? shortcut ?? varOr(cssVar, fallback);

  const fragmentStroke = pick(
    style.fragment?.stroke,
    style.fragmentAccent,
    vars.fragmentAccent,
    defaults.fragmentAccent,
  );

  return {
    background: pick(style.surface?.background, undefined, vars.background, defaults.background),
    text: textChain,
    participantFill: pick(
      style.participant?.fill,
      style.participantFill,
      vars.participantFill,
      defaults.participantFill,
    ),
    participantStroke: pick(style.participant?.stroke, style.accent, vars.participantStroke, accentChain),
    participantText: pick(style.participant?.text, undefined, vars.participantText, textChain),
    lifelineStroke: pick(style.lifeline?.stroke, style.accent, vars.lifeline, accentChain),
    messageStroke: pick(style.message?.stroke, style.accent, vars.message, accentChain),
    messageText: pick(style.message?.text, undefined, vars.messageText, textChain),
    activationFill: pick(style.activation?.fill, undefined, vars.activationFill, mutedChain),
    activationStroke: pick(style.activation?.stroke, undefined, vars.activationStroke, mutedChain),
    fragmentStroke,
    fragmentLabelFill: pick(style.fragment?.labelFill, undefined, vars.fragmentLabelFill, backgroundChain),
    fragmentLabelText: pick(style.fragment?.labelText, undefined, vars.fragmentLabelText, fragmentStroke),
    noteFill: pick(
      style.note?.fill,
      style.participantFill,
      vars.noteFill,
      varOr(vars.participantFill, defaults.participantFill),
    ),
    noteStroke: pick(style.note?.stroke, style.accent, vars.noteStroke, accentChain),
    noteText: pick(style.note?.text, undefined, vars.noteText, textChain),
  };
}

/**
 * CSS custom properties contributed by a document's explicit style section.
 * Shortcuts land first, per-element colors after (so a per-element value
 * wins over its shortcut when both write the same variable).
 */
export function sequenceStyleToCssVars(style: SequenceStyle): Record<string, string> {
  const vars = SEQUENCE_CSS_VARIABLES;
  const variables: Record<string, string> = {};
  const set = (name: string, value: string | undefined): void => {
    if (value !== undefined) variables[name] = value;
  };
  set(vars.accent, style.accent);
  set(vars.fragmentAccent, style.fragmentAccent);
  set(vars.participantFill, style.participantFill);
  set(vars.background, style.surface?.background);
  set(vars.participantFill, style.participant?.fill);
  set(vars.participantStroke, style.participant?.stroke);
  set(vars.participantText, style.participant?.text);
  set(vars.lifeline, style.lifeline?.stroke);
  set(vars.message, style.message?.stroke);
  set(vars.messageText, style.message?.text);
  set(vars.activationFill, style.activation?.fill);
  set(vars.activationStroke, style.activation?.stroke);
  set(vars.fragmentAccent, style.fragment?.stroke);
  set(vars.fragmentLabelFill, style.fragment?.labelFill);
  set(vars.fragmentLabelText, style.fragment?.labelText);
  set(vars.noteFill, style.note?.fill);
  set(vars.noteStroke, style.note?.stroke);
  set(vars.noteText, style.note?.text);
  return variables;
}

/** React-friendly equivalent of {@link sequenceStyleToCssVars}. */
export function sequenceStyleToReactStyle(style: SequenceStyle): CSSProperties {
  return sequenceStyleToCssVars(style) as CSSProperties;
}
