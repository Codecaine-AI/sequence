import "./styles.css";
import type { RailTab } from "../../types";

export type RailTabsProps = {
  tabs: readonly RailTab[];
  selected: RailTab;
  onSelect: (tab: RailTab) => void;
};

/** The rail's pill tabs (Colors / Layout). Rendered only while both tabs show. */
export function RailTabs({ tabs, selected, onSelect }: RailTabsProps) {
  return (
    <div className="rail-tabs" role="tablist">
      {tabs.map((id) => (
        <button
          key={id}
          aria-selected={selected === id}
          className={selected === id ? "rail-tab rail-tab--active" : "rail-tab"}
          onClick={() => onSelect(id)}
          role="tab"
          type="button"
        >
          {id === "colors" ? "Colors" : "Layout"}
        </button>
      ))}
    </div>
  );
}
