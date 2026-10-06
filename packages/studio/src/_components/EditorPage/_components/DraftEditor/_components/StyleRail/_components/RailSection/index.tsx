import type { ReactNode } from "react";
import "./styles.css";
import { Chevron } from "./_components/Chevron";
import { useSectionOpen } from "./useSectionOpen";

export type RailSectionProps = {
  id: string;
  title: string;
  hasOverrides: boolean;
  onReset: () => void;
  children: ReactNode;
};

/**
 * Collapsible rail section: uppercase micro-label + chevron toggle, open
 * state persisted per section id. `hasOverrides` surfaces the Reset
 * affordance, which clears exactly this section's fields via null patches.
 */
export function RailSection({
  id,
  title,
  hasOverrides,
  onReset,
  children,
}: RailSectionProps) {
  const [open, toggle] = useSectionOpen(id);
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
