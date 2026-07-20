import {
  SEQUENCE_LAYOUT,
  SEQUENCE_THEME_DEFAULTS,
  type SequenceStyle,
  type SequenceStylePatch,
} from "@codecaine-ai/sequence";
import { useState, type ReactNode } from "react";

/**
 * Style rail — right-docked panel for live-tuning a document's style,
 * modeled on the docs-system StyleRail profile: two pill tabs (Colors /
 * Layout), stacked collapsible sections with uppercase micro-labels and
 * chevrons, kind-aware rows (color swatch + hex, 0–1 opacity sliders,
 * px length sliders). Every change writes through applySequenceOperations
 * setStyle (deep-merging); a section's Reset sends explicit nulls so the
 * merge clears just that section's fields. Unset knobs show the effective
 * inherited value (shortcut or built-in default) grayed.
 */

export type PatchSequenceStyle = (patch: SequenceStylePatch) => void;

const DEFAULTS = SEQUENCE_THEME_DEFAULTS;

const SECTION_KEY_PREFIX = "sequence-studio.styleRail.section:";

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

function validColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={open ? "rail-chevron" : "rail-chevron rail-chevron--closed"}
      fill="none"
      height="10"
      viewBox="0 0 10 10"
      width="10"
    >
      <path
        d="M2 3.5 L5 6.5 L8 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * Collapsible rail section: uppercase micro-label + chevron toggle, open
 * state persisted per section id. `hasOverrides` surfaces the Reset
 * affordance, which clears exactly this section's fields via null patches.
 */
function RailSection({
  id,
  title,
  hasOverrides,
  onReset,
  children,
}: {
  id: string;
  title: string;
  hasOverrides: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readSectionOpen(id, true));
  const toggle = () =>
    setOpen((previous) => {
      writeSectionOpen(id, !previous);
      return !previous;
    });
  return (
    <section className="rail-section">
      <div className="rail-section-head">
        <button
          aria-expanded={open}
          className="rail-section-toggle"
          onClick={toggle}
          type="button"
        >
          <span className="rail-section-title">{title}</span>
          <Chevron open={open} />
        </button>
        {hasOverrides ? (
          <button
            className="rail-reset"
            onClick={onReset}
            title={`Reset ${title.toLowerCase()} to inherited values`}
            type="button"
          >
            Reset
          </button>
        ) : null}
      </div>
      {open ? <div className="rail-section-body">{children}</div> : null}
    </section>
  );
}

/** Color row: label, hex readout (grayed while inherited), native swatch. */
function ColorRow({
  label,
  value,
  effective,
  onChange,
}: {
  label: string;
  /** The explicitly set value; undefined = inherited. */
  value: string | undefined;
  /** Resolved inherited color shown while unset. */
  effective: string;
  onChange: (value: string) => void;
}) {
  const shown = validColor(value ?? effective);
  return (
    <label className="rail-row rail-row--color">
      <span className="rail-row-label">{label}</span>
      <span
        className={
          value === undefined
            ? "rail-value rail-value--inherited"
            : "rail-value"
        }
      >
        {shown}
      </span>
      <input
        className="rail-swatch"
        onChange={(event) => onChange(event.currentTarget.value)}
        type="color"
        value={shown}
      />
    </label>
  );
}

/** Slider row for lengths, opacities, and scale, with a numeric readout. */
function SliderRow({
  label,
  value,
  effective,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number | undefined;
  effective: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const shown = value ?? effective;
  return (
    <label className="rail-row rail-row--slider">
      <span className="rail-slider-head">
        <span className="rail-row-label">{label}</span>
        <span
          className={
            value === undefined
              ? "rail-value rail-value--inherited"
              : "rail-value"
          }
        >
          {format(shown)}
        </span>
      </span>
      <input
        className="rail-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={shown}
      />
    </label>
  );
}

const px = (value: number): string => `${value}px`;
const ratio = (value: number): string => value.toFixed(2);

export function StyleRail({
  style,
  onPatch,
  onHide,
}: {
  style: SequenceStyle;
  onPatch: PatchSequenceStyle;
  onHide: () => void;
}) {
  const [tab, setTab] = useState<"colors" | "layout">("colors");

  // Effective inherited values, resolved through the shortcut chain the
  // renderer uses: per-element > shortcut > built-in default.
  const accent = style.accent ?? DEFAULTS.accent;
  const fragmentAccent = style.fragmentAccent ?? DEFAULTS.fragmentAccent;
  const participantFill = style.participantFill ?? DEFAULTS.participantFill;
  const fragmentStroke = style.fragment?.stroke ?? fragmentAccent;

  const defined = (...values: unknown[]): boolean =>
    values.some((value) => value !== undefined);

  return (
    <aside aria-label="Style" className="style-rail">
      <div className="rail-head">
        <span className="rail-head-title">Style</span>
        <button
          aria-label="Hide style controls"
          className="rail-hide"
          onClick={onHide}
          title="Hide style controls"
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 14 14" width="14">
            <rect height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" width="10" x="2" y="2" />
            <path d="M9 2 V12" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>

      <div className="rail-tabs" role="tablist">
        {(["colors", "layout"] as const).map((id) => (
          <button
            key={id}
            aria-selected={tab === id}
            className={tab === id ? "rail-tab rail-tab--active" : "rail-tab"}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            {id === "colors" ? "Colors" : "Layout"}
          </button>
        ))}
      </div>

      <div className="rail-body">
        {tab === "colors" ? (
          <>
            <RailSection
              hasOverrides={defined(style.accent, style.fragmentAccent, style.participantFill, style.scale)}
              id="colors:quick"
              onReset={() =>
                onPatch({ accent: null, fragmentAccent: null, participantFill: null, scale: null })}
              title="Quick"
            >
              <ColorRow
                effective={DEFAULTS.accent}
                label="Accent"
                onChange={(value) => onPatch({ accent: value })}
                value={style.accent}
              />
              <ColorRow
                effective={DEFAULTS.fragmentAccent}
                label="Fragment accent"
                onChange={(value) => onPatch({ fragmentAccent: value })}
                value={style.fragmentAccent}
              />
              <ColorRow
                effective={DEFAULTS.participantFill}
                label="Participant fill"
                onChange={(value) => onPatch({ participantFill: value })}
                value={style.participantFill}
              />
              <SliderRow
                effective={1}
                format={(value) => `${ratio(value)}×`}
                label="Scale"
                max={1.8}
                min={0.6}
                onChange={(value) => onPatch({ scale: value })}
                step={0.05}
                value={style.scale}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.surface?.background)}
              id="colors:surface"
              onReset={() => onPatch({ surface: { background: null } })}
              title="Surface"
            >
              <ColorRow
                effective={DEFAULTS.background}
                label="Background"
                onChange={(value) => onPatch({ surface: { background: value } })}
                value={style.surface?.background}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(
                style.participant?.fill,
                style.participant?.stroke,
                style.participant?.text,
                style.participant?.opacity,
              )}
              id="colors:participants"
              onReset={() =>
                onPatch({ participant: { fill: null, stroke: null, text: null, opacity: null } })}
              title="Participants"
            >
              <ColorRow
                effective={participantFill}
                label="Fill"
                onChange={(value) => onPatch({ participant: { fill: value } })}
                value={style.participant?.fill}
              />
              <ColorRow
                effective={accent}
                label="Stroke"
                onChange={(value) => onPatch({ participant: { stroke: value } })}
                value={style.participant?.stroke}
              />
              <ColorRow
                effective={DEFAULTS.text}
                label="Text"
                onChange={(value) => onPatch({ participant: { text: value } })}
                value={style.participant?.text}
              />
              <SliderRow
                effective={1}
                format={ratio}
                label="Opacity"
                max={1}
                min={0}
                onChange={(value) => onPatch({ participant: { opacity: value } })}
                step={0.05}
                value={style.participant?.opacity}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.lifeline?.stroke, style.lifeline?.opacity)}
              id="colors:lifelines"
              onReset={() => onPatch({ lifeline: { stroke: null, opacity: null } })}
              title="Lifelines"
            >
              <ColorRow
                effective={accent}
                label="Stroke"
                onChange={(value) => onPatch({ lifeline: { stroke: value } })}
                value={style.lifeline?.stroke}
              />
              <SliderRow
                effective={1}
                format={ratio}
                label="Opacity"
                max={1}
                min={0}
                onChange={(value) => onPatch({ lifeline: { opacity: value } })}
                step={0.05}
                value={style.lifeline?.opacity}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.message?.stroke, style.message?.text, style.message?.opacity)}
              id="colors:messages"
              onReset={() => onPatch({ message: { stroke: null, text: null, opacity: null } })}
              title="Messages"
            >
              <ColorRow
                effective={accent}
                label="Stroke"
                onChange={(value) => onPatch({ message: { stroke: value } })}
                value={style.message?.stroke}
              />
              <ColorRow
                effective={DEFAULTS.text}
                label="Text"
                onChange={(value) => onPatch({ message: { text: value } })}
                value={style.message?.text}
              />
              <SliderRow
                effective={1}
                format={ratio}
                label="Opacity"
                max={1}
                min={0}
                onChange={(value) => onPatch({ message: { opacity: value } })}
                step={0.05}
                value={style.message?.opacity}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(
                style.activation?.fill,
                style.activation?.stroke,
                style.activation?.opacity,
              )}
              id="colors:activations"
              onReset={() => onPatch({ activation: { fill: null, stroke: null, opacity: null } })}
              title="Activations"
            >
              <ColorRow
                effective={DEFAULTS.muted}
                label="Fill"
                onChange={(value) => onPatch({ activation: { fill: value } })}
                value={style.activation?.fill}
              />
              <ColorRow
                effective={DEFAULTS.muted}
                label="Stroke"
                onChange={(value) => onPatch({ activation: { stroke: value } })}
                value={style.activation?.stroke}
              />
              <SliderRow
                effective={1}
                format={ratio}
                label="Opacity"
                max={1}
                min={0}
                onChange={(value) => onPatch({ activation: { opacity: value } })}
                step={0.05}
                value={style.activation?.opacity}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(
                style.fragment?.stroke,
                style.fragment?.labelFill,
                style.fragment?.labelText,
                style.fragment?.bodyOpacity,
              )}
              id="colors:fragments"
              onReset={() =>
                onPatch({ fragment: { stroke: null, labelFill: null, labelText: null, bodyOpacity: null } })}
              title="Fragments"
            >
              <ColorRow
                effective={fragmentAccent}
                label="Stroke"
                onChange={(value) => onPatch({ fragment: { stroke: value } })}
                value={style.fragment?.stroke}
              />
              <ColorRow
                effective={style.surface?.background ?? DEFAULTS.background}
                label="Label fill"
                onChange={(value) => onPatch({ fragment: { labelFill: value } })}
                value={style.fragment?.labelFill}
              />
              <ColorRow
                effective={fragmentStroke}
                label="Label text"
                onChange={(value) => onPatch({ fragment: { labelText: value } })}
                value={style.fragment?.labelText}
              />
              <SliderRow
                effective={0}
                format={ratio}
                label="Body opacity"
                max={1}
                min={0}
                onChange={(value) => onPatch({ fragment: { bodyOpacity: value } })}
                step={0.05}
                value={style.fragment?.bodyOpacity}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.note?.fill, style.note?.stroke, style.note?.opacity)}
              id="colors:notes"
              onReset={() => onPatch({ note: { fill: null, stroke: null, opacity: null } })}
              title="Notes"
            >
              <ColorRow
                effective={participantFill}
                label="Fill"
                onChange={(value) => onPatch({ note: { fill: value } })}
                value={style.note?.fill}
              />
              <ColorRow
                effective={accent}
                label="Stroke"
                onChange={(value) => onPatch({ note: { stroke: value } })}
                value={style.note?.stroke}
              />
              <SliderRow
                effective={1}
                format={ratio}
                label="Opacity"
                max={1}
                min={0}
                onChange={(value) => onPatch({ note: { opacity: value } })}
                step={0.05}
                value={style.note?.opacity}
              />
            </RailSection>
          </>
        ) : (
          <>
            <RailSection
              hasOverrides={defined(
                style.surface?.margin,
                style.surface?.columnGap,
                style.surface?.rowGap,
              )}
              id="layout:surface"
              onReset={() => onPatch({ surface: { margin: null, columnGap: null, rowGap: null } })}
              title="Surface"
            >
              <SliderRow
                effective={SEQUENCE_LAYOUT.MARGIN}
                format={px}
                label="Margin"
                max={96}
                min={0}
                onChange={(value) => onPatch({ surface: { margin: value } })}
                step={1}
                value={style.surface?.margin}
              />
              <SliderRow
                effective={SEQUENCE_LAYOUT.COLUMN_GAP}
                format={px}
                label="Column gap"
                max={320}
                min={40}
                onChange={(value) => onPatch({ surface: { columnGap: value } })}
                step={4}
                value={style.surface?.columnGap}
              />
              <SliderRow
                effective={SEQUENCE_LAYOUT.ROW_H}
                format={px}
                label="Row gap"
                max={120}
                min={16}
                onChange={(value) => onPatch({ surface: { rowGap: value } })}
                step={2}
                value={style.surface?.rowGap}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.participant?.padding, style.participant?.cornerRadius)}
              id="layout:participants"
              onReset={() => onPatch({ participant: { padding: null, cornerRadius: null } })}
              title="Participants"
            >
              <SliderRow
                effective={SEQUENCE_LAYOUT.HEADER_PAD_X}
                format={px}
                label="Padding"
                max={48}
                min={0}
                onChange={(value) => onPatch({ participant: { padding: value } })}
                step={1}
                value={style.participant?.padding}
              />
              <SliderRow
                effective={4}
                format={px}
                label="Corner radius"
                max={20}
                min={0}
                onChange={(value) => onPatch({ participant: { cornerRadius: value } })}
                step={1}
                value={style.participant?.cornerRadius}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.lifeline?.dash)}
              id="layout:lifelines"
              onReset={() => onPatch({ lifeline: { dash: null } })}
              title="Lifelines"
            >
              <SliderRow
                effective={5}
                format={(value) => (value === 0 ? "solid" : px(value))}
                label="Dash"
                max={24}
                min={0}
                onChange={(value) => onPatch({ lifeline: { dash: value } })}
                step={1}
                value={style.lifeline?.dash}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.message?.labelGap)}
              id="layout:messages"
              onReset={() => onPatch({ message: { labelGap: null } })}
              title="Messages"
            >
              <SliderRow
                effective={6}
                format={px}
                label="Label gap"
                max={32}
                min={0}
                onChange={(value) => onPatch({ message: { labelGap: value } })}
                step={1}
                value={style.message?.labelGap}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.activation?.width)}
              id="layout:activations"
              onReset={() => onPatch({ activation: { width: null } })}
              title="Activations"
            >
              <SliderRow
                effective={SEQUENCE_LAYOUT.ACTIVATION_W}
                format={px}
                label="Width"
                max={32}
                min={4}
                onChange={(value) => onPatch({ activation: { width: value } })}
                step={1}
                value={style.activation?.width}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.fragment?.padding)}
              id="layout:fragments"
              onReset={() => onPatch({ fragment: { padding: null } })}
              title="Fragments"
            >
              <SliderRow
                effective={SEQUENCE_LAYOUT.FRAG_PAD}
                format={px}
                label="Padding"
                max={48}
                min={0}
                onChange={(value) => onPatch({ fragment: { padding: value } })}
                step={1}
                value={style.fragment?.padding}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.note?.padding)}
              id="layout:notes"
              onReset={() => onPatch({ note: { padding: null } })}
              title="Notes"
            >
              <SliderRow
                effective={8}
                format={px}
                label="Padding"
                max={48}
                min={0}
                onChange={(value) => onPatch({ note: { padding: value } })}
                step={1}
                value={style.note?.padding}
              />
            </RailSection>

            <RailSection
              hasOverrides={defined(style.scale)}
              id="layout:scale"
              onReset={() => onPatch({ scale: null })}
              title="Scale"
            >
              <SliderRow
                effective={1}
                format={(value) => `${ratio(value)}×`}
                label="Scale"
                max={1.8}
                min={0.6}
                onChange={(value) => onPatch({ scale: value })}
                step={0.05}
                value={style.scale}
              />
            </RailSection>
          </>
        )}
      </div>
    </aside>
  );
}
