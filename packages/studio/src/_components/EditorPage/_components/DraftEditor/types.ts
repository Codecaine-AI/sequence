export type ProgramError = { line: number; message: string };

/** The program's parse verdict: pending while typing, then valid or error. */
export type ParseState = "valid" | "pending" | "error";
