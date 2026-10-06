/**
 * Typography and text measurement for the sequence engine.
 *
 * `SEQUENCE_TYPOGRAPHY` is the single source of truth for every font the SVG
 * renderer paints. Layout measures with `sequenceFont(role, scale)` and the
 * renderer draws with the same call, so measured and drawn text cannot drift.
 *
 * Widths come from `@codecaine-ai/text-measure` unless a host injects its own
 * metrics. They are exact once the host loads the bundled fonts:
 * `useHarfBuzz()` in Bun / Node, `fonts.css` plus `useBrowserFonts()` in a
 * browser. Until then text-measure's advance table is used (exact for ASCII,
 * within about 1 px per string elsewhere).
 */

import { flat, type BaseTokenPath } from "@codecaine-ai/design-system";
import { measureWidth, onBackendChange, wrapText, type FontSpec } from "@codecaine-ai/text-measure";

export interface SeqFont {
  /** CSS px, already multiplied by the document scale. */
  size: number;
  /** CSS font-family stack as drawn; a measurer models its first family. */
  family: string;
  weight: "normal" | "bold" | number;
  /** Px between baselines, already scaled; set for the roles that wrap (note, title). */
  lineHeight?: number;
}

/**
 * Width in px of `text` drawn as one line in `font`. Layout passes text
 * exactly as the SVG draws it: single-line labels with whitespace collapsed
 * ({@link singleLineText}), wrapped note and title lines as broken.
 */
export type SequenceTextMeasure = (text: string, font: SeqFont) => number;

/**
 * Breaks `text` into display lines no wider than `maxWidth` (CSS
 * `white-space: pre-wrap` with `overflow-wrap: break-word`): every explicit
 * "\n" starts a new line, soft breaks fall at spaces, and a word wider than
 * `maxWidth` breaks between graphemes. Layout hands over text whose space
 * runs are already collapsed, and collapses each returned line the same way
 * before drawing it.
 */
export type SequenceTextWrap = (text: string, font: SeqFont, maxWidth: number) => string[];

/**
 * Host-supplied text metrics, replacing the default text-measure widths.
 * Without `wrap`, layout wraps notes and titles greedily over `measure`.
 */
export interface SequenceTextMetrics {
  measure: SequenceTextMeasure;
  wrap?: SequenceTextWrap;
}

/** What layout and the render surfaces accept: a bare measurer or a metrics object. */
export type SequenceMeasureInput = SequenceTextMeasure | SequenceTextMetrics;

/** Every kind of text the renderer paints. */
export type SequenceTextRole =
  | "participant"
  | "stereotype"
  | "message"
  | "note"
  | "fragmentOp"
  | "guard"
  | "title";

export interface SequenceTextStyle {
  /** Base px at scale = 1. */
  readonly size: number;
  /** Numeric CSS font weight. */
  readonly weight: number;
  /** Base px between baselines when the role wraps onto several lines. */
  readonly lineHeight?: number;
}

/** A design-system px token as a number: "12px" is 12. */
function tokenPx(path: BaseTokenPath): number {
  const value = String(flat.base[path]);
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) throw new Error(`@codecaine-ai/sequence: token ${path} is "${value}", not a px size`);
  return Number(match[1]);
}

const UI_XS = tokenPx("font.size.ui-xs");
const UI_2XS = tokenPx("font.size.ui-2xs");
const REGULAR = Number(flat.base["font.weight.regular"]);
const SEMIBOLD = Number(flat.base["font.weight.semibold"]);
const BOLD = Number(flat.base["font.weight.bold"]);

/**
 * Size and weight per text role, plus the family stack (the design system's
 * `font.family.sans`, Inter first). Sizes and weights come from the design
 * tokens; the title's 16 px and the wrap line heights have no token. Hosts can
 * still restyle the family with `--seq-font-family`, but measurements then
 * model this stack rather than the override.
 */
export const SEQUENCE_TYPOGRAPHY = {
  family: flat.base["font.family.sans"],
  participant: { size: UI_XS, weight: SEMIBOLD },
  stereotype: { size: UI_2XS, weight: REGULAR },
  message: { size: UI_XS, weight: REGULAR },
  note: { size: UI_XS, weight: REGULAR, lineHeight: 15 },
  fragmentOp: { size: UI_XS, weight: BOLD },
  guard: { size: UI_2XS, weight: REGULAR },
  title: { size: 16, weight: BOLD, lineHeight: 20 },
} as const satisfies { readonly family: string } & Record<SequenceTextRole, SequenceTextStyle>;

/** The font one text role is measured and drawn with at a document scale. */
export function sequenceFont(role: SequenceTextRole, scale = 1): SeqFont {
  const style: SequenceTextStyle = SEQUENCE_TYPOGRAPHY[role];
  const font: SeqFont = { size: style.size * scale, family: SEQUENCE_TYPOGRAPHY.family, weight: style.weight };
  if (style.lineHeight !== undefined) font.lineHeight = style.lineHeight * scale;
  return font;
}

/**
 * Code points XML 1.0 forbids: C0 controls other than tab, line feed and
 * carriage return, U+FFFE, U+FFFF, and lone surrogates (with the `u` flag a
 * surrogate range only matches unpaired halves).
 */
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿\uD800-\uDFFF]/gu;

/** `text` without the code points XML 1.0 forbids, so serialized SVG always parses. */
export function withoutXmlInvalid(text: string): string {
  return text.replace(XML_INVALID, "");
}

/**
 * The string SVG paints for single-line text (participant names,
 * stereotypes, message labels, guards): runs of spaces, tabs and line
 * breaks become one space, spaces at either end are dropped, as SVG's
 * default white-space handling does, and code points XML forbids are
 * removed (form feed counts as a space). Layout measures this string and the
 * renderer emits it, so both agree in every renderer, including those that
 * drop line breaks instead of turning them into spaces.
 */
export function singleLineText(text: string): string {
  return withoutXmlInvalid(text.replace(/\f/g, " "))
    .replace(/[ \t\n\r]+/g, " ")
    .replace(/^ | $/g, "");
}

/**
 * Wrapping text (notes, titles) before it is broken into lines: line breaks
 * stay, and each line's space runs collapse as in {@link singleLineText}.
 * Together with collapsing every broken line, this is CSS
 * `white-space: pre-line`, which the default SVG text handling draws as is.
 */
function paragraphText(text: string): string {
  return text.split(/\r\n|\r|\n/).map(singleLineText).join("\n");
}

/** Numeric CSS weight for a font: "normal" is 400 and "bold" is 700. */
function numericFontWeight(weight: SeqFont["weight"]): number {
  if (weight === "bold") return 700;
  if (weight === "normal") return 400;
  return Number.isFinite(weight) && weight > 0 ? weight : 400;
}

function fontSpec(font: SeqFont): FontSpec {
  return { family: font.family, size: font.size, weight: numericFontWeight(font.weight) };
}

const warned = new Set<string>();

/** Reports a text-measure failure once per kind, never silently and never per label. */
function warnOnce(kind: string, consequence: string, error: unknown): void {
  if (warned.has(kind)) return;
  warned.add(kind);
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`@codecaine-ai/sequence: text-measure ${kind} failed (${reason}); ${consequence}.`);
}

/** text-measure's single-line width; 0 (with a warning) for a font it cannot measure. */
function textMeasureWidth(text: string, font: SeqFont): number {
  try {
    return measureWidth(text, fontSpec(font));
  } catch (error) {
    warnOnce("measureWidth", "such text is laid out as zero width", error);
    return 0;
  }
}

/**
 * text-measure's line breaking (Pretext). If it fails (for example when
 * another library initialized Pretext first), lines break greedily over
 * text-measure's widths instead, so notes and titles still fit their box.
 */
function textMeasureWrap(text: string, font: SeqFont, maxWidth: number): string[] {
  try {
    return wrapText(text, fontSpec(font), {
      maxWidth: Number.isNaN(maxWidth) ? Number.POSITIVE_INFINITY : Math.max(0, maxWidth),
      // Line height never moves a break; it only sizes the result, which layout recomputes.
      lineHeight: font.lineHeight ?? font.size,
      whiteSpace: "pre-wrap",
    }).lines.map((line) => line.text);
  } catch (error) {
    warnOnce("wrapText", "notes and titles break lines greedily over measured widths instead", error);
    return wrapTextGreedy(text, font, maxWidth, textMeasureWidth);
  }
}

const graphemeSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : undefined;

// Fallback clusters for runtimes without Intl.Segmenter: a flag pair, or a
// base code point with its combining marks, skin-tone modifiers, and
// ZWJ-joined continuations. Every code point lands in some match.
const APPROXIMATE_GRAPHEME =
  /\p{RI}\p{RI}|\P{M}[\p{M}\u{1F3FB}-\u{1F3FF}]*(?:‍\P{M}[\p{M}\u{1F3FB}-\u{1F3FF}]*)*|\p{M}+/gu;

function graphemes(text: string): string[] {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment)
    : text.match(APPROXIMATE_GRAPHEME) ?? [];
}

const SPACE_RUN = /^[ \t]+$/;

/**
 * Greedy line breaking over a host measurer, with the
 * {@link SequenceTextWrap} contract. Spaces at a soft break are dropped;
 * spaces inside a line are kept. As in CSS, a line break that ends the text
 * does not start another line.
 */
function wrapTextGreedy(
  text: string,
  font: SeqFont,
  maxWidth: number,
  measure: SequenceTextMeasure,
): string[] {
  const limit = Number.isNaN(maxWidth) ? Number.POSITIVE_INFINITY : Math.max(0, maxWidth);
  const fits = (value: string): boolean => measure(value, font) <= limit;
  const lines: string[] = [];
  const paragraphs = text.split(/\r\n|\r|\n/);
  if (paragraphs.length > 1 && paragraphs[paragraphs.length - 1] === "") paragraphs.pop();
  for (const paragraph of paragraphs) {
    let line = "";
    let gap = "";
    for (const token of paragraph.match(/[ \t]+|[^ \t]+/g) ?? []) {
      if (SPACE_RUN.test(token)) {
        gap += token;
        continue;
      }
      if (fits(line + gap + token)) {
        line += gap + token;
        gap = "";
        continue;
      }
      if (line !== "") lines.push(line);
      line = "";
      gap = "";
      if (fits(token)) {
        line = token;
        continue;
      }
      // The word alone is too wide: break it between graphemes, at least one
      // grapheme per line so a zero-width limit still terminates.
      for (const grapheme of graphemes(token)) {
        if (line !== "" && !fits(line + grapheme)) {
          lines.push(line);
          line = "";
        }
        line += grapheme;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Normalized, failure-tolerant metrics consumed by layout. */
export interface ResolvedSequenceTextMetrics {
  /** Width of a single-line label as drawn: measures {@link singleLineText} of `text`. */
  measure: SequenceTextMeasure;
  /** The lines a note or title draws (at least one; blank lines are ""). */
  wrap: SequenceTextWrap;
}

/**
 * Accepts a bare measurer, a metrics object, or nothing, and returns metrics
 * that never throw. Without host metrics, widths and line breaks come from
 * text-measure. A host measurer that throws or returns a non-finite or
 * negative width falls back to text-measure's width, and a host wrapper
 * that throws or returns no lines falls back to the default line breaking.
 */
export function resolveSequenceTextMetrics(input?: SequenceMeasureInput): ResolvedSequenceTextMetrics {
  const metrics: Partial<SequenceTextMetrics> | undefined = typeof input === "function"
    ? { measure: input }
    : input !== null && typeof input === "object"
      ? input
      : undefined;
  // Bound, so metrics objects whose methods use `this` (class instances) work.
  const hostMeasure = typeof metrics?.measure === "function" ? metrics.measure.bind(metrics) : undefined;
  const hostWrap = typeof metrics?.wrap === "function" ? metrics.wrap.bind(metrics) : undefined;

  const measureRaw: SequenceTextMeasure = (text, font) => {
    if (!hostMeasure) return textMeasureWidth(text, font);
    let measured: number;
    try {
      measured = hostMeasure(text, font);
    } catch {
      return textMeasureWidth(text, font);
    }
    return Number.isFinite(measured) && measured >= 0 ? measured : textMeasureWidth(text, font);
  };

  const hostLines = (text: string, font: SeqFont, maxWidth: number): string[] | undefined => {
    if (!hostWrap) return undefined;
    try {
      const result: unknown = hostWrap(text, font, maxWidth);
      // Array.from turns holes in a sparse result into undefined entries,
      // which then fail the check instead of being skipped by every().
      const lines: unknown[] = Array.isArray(result) ? Array.from(result) : [];
      if (lines.length > 0 && lines.every((line): line is string => typeof line === "string")) {
        return lines;
      }
    } catch {
      // Fall through to the default line breaking.
    }
    return undefined;
  };

  const wrap: SequenceTextWrap = (text, font, maxWidth) => {
    const source = paragraphText(text);
    const lines = hostLines(source, font, maxWidth)
      ?? (hostMeasure
        ? wrapTextGreedy(source, font, maxWidth, measureRaw)
        : textMeasureWrap(source, font, maxWidth));
    // Drawn lines: hanging spaces at soft breaks go, runs collapse.
    const drawn = lines.map(singleLineText);
    return drawn.length > 0 ? drawn : [""];
  };

  return { measure: (text, font) => measureRaw(singleLineText(text), font), wrap };
}

let textMeasureVersion = 0;
// Registered when this module loads, before any component subscribes, so the
// counter has moved by the time a subscriber's listener reads it.
onBackendChange(() => {
  textMeasureVersion += 1;
});

/**
 * Changes whenever text-measure switches backend (fonts loaded, HarfBuzz
 * ready): default-metrics layouts made before a change are stale.
 */
export function sequenceTextMetricsVersion(): number {
  return textMeasureVersion;
}

/** Calls `listener` after every text-measure backend switch; returns an unsubscribe function. */
export function onSequenceTextMetricsChange(listener: () => void): () => void {
  return onBackendChange(listener);
}
