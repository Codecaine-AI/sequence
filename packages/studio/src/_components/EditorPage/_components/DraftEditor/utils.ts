import type { ProgramError } from "./types";

export function errorLine(message: string): number {
  const match = message.match(/(?:line\s+|^)(\d+)/i);
  return match ? Number(match[1]) : 1;
}

export function errorsFromOperation(messages: string[]): ProgramError[] {
  return messages.map((message) => ({ line: errorLine(message), message }));
}
