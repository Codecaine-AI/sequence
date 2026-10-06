import { cssVarName, flat, type ThemeName, type ThemeTokenPath } from "@codecaine-ai/design-system";
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

/**
 * The `@codecaine-ai/design-system` token behind each default color. Lines,
 * fragments and activation bars are three element families, so they take
 * categorical hue tokens (orange, blue, gray), each in the role it paints:
 * `.solid` for strokes and fills, `.text` for fragment labels. Activation
 * outlines take a border role; everything else takes a neutral role.
 *
 * `muted` is kept for compatibility. `--seq-muted` has no default of its own
 * (a host that sets it colors both activation fill and stroke), and its value
 * equals `activationFill`.
 */
export const SEQUENCE_THEME_TOKENS = {
  accent: "color.orange.solid",
  fragmentAccent: "color.blue.solid",
  fragmentLabelText: "color.blue.text",
  participantFill: "color.surface.panel",
  text: "color.text.body",
  muted: "color.gray.solid",
  activationFill: "color.gray.solid",
  activationStroke: "color.border.default",
  background: "color.surface.page",
} as const satisfies Record<string, ThemeTokenPath>;

export type SequenceThemeColor = keyof typeof SEQUENCE_THEME_TOKENS;
export type SequenceThemeDefaults = Readonly<Record<SequenceThemeColor, string>>;

const THEME_COLORS = Object.keys(SEQUENCE_THEME_TOKENS) as SequenceThemeColor[];

function themeDefaults(theme: ThemeName): SequenceThemeDefaults {
  const values = {} as Record<SequenceThemeColor, string>;
  for (const color of THEME_COLORS) values[color] = flat[theme][SEQUENCE_THEME_TOKENS[color]];
  return Object.freeze(values);
}

/**
 * The default colors as resolved light-theme token values, each a `#rrggbb`.
 * They are the innermost `var()` fallbacks, so a renderer that resolves
 * `var()` paints them where no stylesheet defines the variables: an `<img>`
 * or data-URL SVG, or a page or PDF frame without `tokens.css`. Not checked:
 * renderers without CSS `var()` support (resvg, for example); give those
 * literal colors.
 */
export const SEQUENCE_THEME_DEFAULTS = themeDefaults("light");

/** The same defaults resolved from the dark theme. */
export const SEQUENCE_THEME_DEFAULTS_DARK = themeDefaults("dark");

const THEME_DEFAULTS: Readonly<Record<ThemeName, SequenceThemeDefaults>> = {
  light: SEQUENCE_THEME_DEFAULTS,
  dark: SEQUENCE_THEME_DEFAULTS_DARK,
};

/**
 * The defaults {@link sequenceThemeCssVars} pins: for each chain, the lowest
 * `--seq-*` variable that holds one default. Left out: `--seq-muted` (it would
 * paint activation fill and stroke alike) and `--seq-fragment-label-text`
 * (the label follows `--seq-fragment-accent` and a document's fragment
 * shortcut, which a pinned label would override).
 */
const PINNED_COLORS = [
  "accent",
  "fragmentAccent",
  "participantFill",
  "text",
  "activationFill",
  "activationStroke",
  "background",
] as const satisfies readonly SequenceThemeColor[];

/**
 * One theme's defaults as `--seq-*` custom properties, for a standalone SVG
 * that cannot load the design-system stylesheet (a dark `<img>` export, for
 * example). Apply a document's own style variables after these so they still
 * win. A page that loads `tokens.css` needs none of this: the render
 * fallbacks already follow its light or dark theme.
 */
export function sequenceThemeCssVars(theme: ThemeName = "light"): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const color of PINNED_COLORS) variables[SEQUENCE_CSS_VARIABLES[color]] = THEME_DEFAULTS[theme][color];
  return variables;
}

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
 * Built-in default per color: `var(--ds-<token>, <light value>)`. In a page
 * that loads the design-system tokens it follows that page's light or dark
 * theme; anywhere else it is the light value.
 */
const DEFAULT_CHAINS = {} as Record<SequenceThemeColor, string>;
for (const color of THEME_COLORS) {
  DEFAULT_CHAINS[color] = varOr(cssVarName(SEQUENCE_THEME_TOKENS[color]), SEQUENCE_THEME_DEFAULTS[color]);
}

/**
 * Resolve every renderer color for a document. Precedence per knob:
 * per-element style value > shortcut (accent / fragmentAccent /
 * participantFill) > `--seq-*` CSS variable > design-system token
 * (`--ds-*`) > its light value. Explicit style values become literals;
 * everything else stays a var() chain so host CSS can re-theme the SVG.
 */
export function resolveSequenceColors(style: SequenceStyle): SequenceResolvedColors {
  const vars = SEQUENCE_CSS_VARIABLES;
  const defaults = DEFAULT_CHAINS;
  const accentChain = varOr(vars.accent, defaults.accent);
  const textChain = varOr(vars.text, defaults.text);
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
  // Same precedence as the frame; only the built-in default takes the text role.
  const fragmentText = pick(
    style.fragment?.stroke,
    style.fragmentAccent,
    vars.fragmentAccent,
    defaults.fragmentLabelText,
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
    activationFill: pick(
      style.activation?.fill,
      undefined,
      vars.activationFill,
      varOr(vars.muted, defaults.activationFill),
    ),
    activationStroke: pick(
      style.activation?.stroke,
      undefined,
      vars.activationStroke,
      varOr(vars.muted, defaults.activationStroke),
    ),
    fragmentStroke,
    fragmentLabelFill: pick(style.fragment?.labelFill, undefined, vars.fragmentLabelFill, backgroundChain),
    fragmentLabelText: pick(style.fragment?.labelText, undefined, vars.fragmentLabelText, fragmentText),
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
