import {
  applySequenceOperations,
  parseSequenceProgram,
  serializeSequenceProgram,
  type SequenceDocument,
} from "@codecaine-ai/sequence";
import { useEffect, useState, type RefObject } from "react";
import type { ParseState, ProgramError } from "./types";
import { errorsFromOperation } from "./utils";

/**
 * The program text and its parse. Debounced: pending immediately, verdict
 * after 150ms of quiet. A valid program becomes the document through
 * replaceDocument; the last valid document keeps rendering while the program
 * has errors.
 */
export function useProgram(
  initialDocument: SequenceDocument,
  docRef: RefObject<SequenceDocument>,
  replaceDocument: (nextDocument: SequenceDocument) => void,
): {
  program: string;
  setProgram: (program: string) => void;
  errors: ProgramError[];
  parseState: ParseState;
  formatProgram: () => void;
} {
  const [program, setProgram] = useState(() =>
    serializeSequenceProgram(initialDocument),
  );
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [parseState, setParseState] = useState<ParseState>("valid");

  useEffect(() => {
    setParseState("pending");
    const timer = window.setTimeout(() => {
      const parsed = parseSequenceProgram(program);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        setParseState("error");
        return;
      }

      const applied = applySequenceOperations(docRef.current, [
        { type: "setProgram", program },
      ]);
      if (!applied.ok) {
        setErrors(errorsFromOperation(applied.errors));
        setParseState("error");
        return;
      }

      setErrors([]);
      setParseState("valid");
      replaceDocument(applied.document);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [program, replaceDocument]);

  const formatProgram = () => {
    const parsed = parseSequenceProgram(program);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setParseState("error");
      return;
    }
    setErrors([]);
    setParseState("valid");
    setProgram(serializeSequenceProgram(parsed.document));
  };

  return { program, setProgram, errors, parseState, formatProgram };
}
