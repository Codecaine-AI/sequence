import { SEQUENCE_THEME_DEFAULTS, type SequenceStyle } from "@codecaine-ai/sequence";
import { RailSection } from "../RailSection";
import { SliderRow } from "../SliderRow";
import type { PatchSequenceStyle } from "../../types";
import { defined, ratio } from "../../utils";
import { ColorRow } from "./_components/ColorRow";

const DEFAULTS = SEQUENCE_THEME_DEFAULTS;

export type ColorControlsProps = {
  style: SequenceStyle;
  onPatch: PatchSequenceStyle;
};

/**
 * The Colors tab: one section per diagram part, each with its color rows and
 * opacity. Hidden while SHOW_COLOR_CONTROLS is false (owner decision); the
 * code stays so the tab can come back.
 */
export function ColorControls({ style, onPatch }: ColorControlsProps) {
  // Effective inherited values, resolved through the shortcut chain the
  // renderer uses: per-element > shortcut > built-in default.
  const accent = style.accent ?? DEFAULTS.accent;
  const fragmentAccent = style.fragmentAccent ?? DEFAULTS.fragmentAccent;
  const participantFill = style.participantFill ?? DEFAULTS.participantFill;
  // The label follows the frame's own color when one is set; otherwise its
  // default takes the text role (renderer: resolveSequenceColors).
  const fragmentLabelText = style.fragment?.stroke ?? style.fragmentAccent ?? DEFAULTS.fragmentLabelText;

  return (
    <div>
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
          effective={DEFAULTS.activationFill}
          label="Fill"
          onChange={(value) => onPatch({ activation: { fill: value } })}
          value={style.activation?.fill}
        />
        <ColorRow
          effective={DEFAULTS.activationStroke}
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
          effective={fragmentLabelText}
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
    </div>
  );
}
