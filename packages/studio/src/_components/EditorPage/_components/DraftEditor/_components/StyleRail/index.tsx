import type { SequenceStyle } from "@codecaine-ai/sequence";
import { useState } from "react";
import "./styles.css";
import { ColorControls } from "./_components/ColorControls";
import { LayoutControls } from "./_components/LayoutControls";
import { RailTabs } from "./_components/RailTabs";
import { RAIL_TABS, SHOW_COLOR_CONTROLS } from "./constants";
import type { PatchSequenceStyle, RailTab } from "./types";

export type { PatchSequenceStyle } from "./types";

export type StyleRailProps = {
  style: SequenceStyle;
  onPatch: PatchSequenceStyle;
};

/**
 * Style rail — the editor's inspector content for live-tuning a document's style,
 * modeled on the docs-system StyleRail profile: two pill tabs (Colors /
 * Layout), stacked collapsible sections with uppercase micro-labels and
 * chevrons, kind-aware rows (color swatch + hex, 0–1 opacity sliders,
 * px length sliders). Every change writes through applySequenceOperations
 * setStyle (deep-merging); a section's Reset sends explicit nulls so the
 * merge clears just that section's fields. Unset knobs show the effective
 * inherited value (shortcut or built-in default) grayed.
 *
 * The Colors tab is hidden for now (SHOW_COLOR_CONTROLS): diagrams take
 * their colors from the shared design-system tokens, so the rail shows only
 * the size and density controls on the Layout tab. Its code stays so the
 * tab can come back.
 *
 * The app shell's inspector frames it: the inspector header carries the
 * "Style" title and the close button, and its body scrolls.
 */
export function StyleRail({ style, onPatch }: StyleRailProps) {
  const [tab, setTab] = useState<RailTab>(RAIL_TABS[0]);

  return (
    <div className="style-rail">
      {RAIL_TABS.length > 1 ? (
        <RailTabs tabs={RAIL_TABS} selected={tab} onSelect={setTab} />
      ) : null}

      {SHOW_COLOR_CONTROLS && tab === "colors" ? (
        <ColorControls style={style} onPatch={onPatch} />
      ) : (
        <LayoutControls style={style} onPatch={onPatch} />
      )}
    </div>
  );
}
