import type {
  ParseState,
  ProgramError,
} from "@/_components/EditorPage/_components/DraftEditor/types";
import "./styles.css";

export type ProgramStatusProps = {
  parseState: ParseState;
  errors: ProgramError[];
};

/** The program's parse status under the text: checking, valid, or its errors by line. */
export function ProgramStatus({ parseState, errors }: ProgramStatusProps) {
  return (
    <div
      id="program-status"
      className={`program-status status-${parseState}`}
      aria-live="polite"
      // A long error list scrolls: focusable then, so a keyboard can scroll it.
      tabIndex={errors.length > 0 ? 0 : undefined}
    >
      {parseState === "pending" ? (
        <p>Checking program…</p>
      ) : errors.length > 0 ? (
        <>
          <p className="status-title">
            Fix the program to update the preview.
          </p>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error.line}:${error.message}:${index}`}>
                <strong>Line {error.line}:</strong> {error.message}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Program is valid.</p>
      )}
    </div>
  );
}
