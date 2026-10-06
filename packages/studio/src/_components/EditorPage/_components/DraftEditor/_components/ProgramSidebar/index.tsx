import type { ChangeEvent } from "react";
import "./styles.css";
import type { ParseState, ProgramError } from "../../types";
import { ProgramStatus } from "./_components/ProgramStatus";

export type ProgramSidebarProps = {
  program: string;
  onProgramChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  parseState: ParseState;
  errors: ProgramError[];
  onFormat: () => void;
};

/** The Program pane: the sequence program's text, Format, and its parse status. */
export function ProgramSidebar({
  program,
  onProgramChange,
  parseState,
  errors,
  onFormat,
}: ProgramSidebarProps) {
  return (
    <section className="program-sidebar" aria-label="Program">
      <div className="sidebar-head">
        <span className="micro-label">Program</span>
        <button
          type="button"
          className="btn btn-outline btn-compact"
          onClick={onFormat}
          disabled={parseState === "error"}
        >
          Format
        </button>
      </div>
      <textarea
        className="program-editor"
        value={program}
        onChange={onProgramChange}
        spellCheck={false}
        aria-label="Sequence program"
        aria-invalid={parseState === "error"}
        aria-describedby="program-status"
      />
      <ProgramStatus parseState={parseState} errors={errors} />
    </section>
  );
}
