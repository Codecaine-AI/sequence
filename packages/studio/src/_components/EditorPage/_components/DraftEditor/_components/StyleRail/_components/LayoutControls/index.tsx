import { SEQUENCE_LAYOUT, type SequenceStyle } from "@codecaine-ai/sequence";
import { RailSection } from "../RailSection";
import { SliderRow } from "../SliderRow";
import type { PatchSequenceStyle } from "../../types";
import { defined, px, ratio } from "../../utils";

export type LayoutControlsProps = {
  style: SequenceStyle;
  onPatch: PatchSequenceStyle;
};

/** The Layout tab: the size and density sliders, one section per diagram part. */
export function LayoutControls({ style, onPatch }: LayoutControlsProps) {
  return (
    <div>
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
    </div>
  );
}
