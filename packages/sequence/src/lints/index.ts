import type { SequenceDocument, SequenceItem, SequenceMessage } from "../schema";

/** One lint finding. Lints only report: they never change the document. */
export interface SequenceLintResult {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** Item or participant id the finding points at, when it has one. */
  target?: string;
}

/** A message that crosses this many other lifelines or more is reported. */
export const CROSSED_COLUMNS_LIMIT = 2;

function messagesOf(items: readonly SequenceItem[]): SequenceMessage[] {
  return items.flatMap((item) =>
    item.kind === "message"
      ? [item]
      : item.kind === "fragment"
        ? item.operands.flatMap((operand) => messagesOf(operand.items))
        : []);
}

/**
 * Quality lints for a sequence document. `crossed-columns`: a message that
 * crosses 2 or more other lifelines, which usually means the column order
 * keeps two busy participants apart.
 */
export function lintSequence(document: SequenceDocument): SequenceLintResult[] {
  const column = new Map(document.participants.map((participant, index) => [participant.id, index]));
  const results: SequenceLintResult[] = [];
  for (const message of messagesOf(document.items)) {
    const from = column.get(message.from);
    const to = column.get(message.to);
    if (from === undefined || to === undefined) continue;
    const crossed = document.participants.slice(Math.min(from, to) + 1, Math.max(from, to));
    if (crossed.length < CROSSED_COLUMNS_LIMIT) continue;
    const name = (index: number): string => document.participants[index]!.label ?? document.participants[index]!.name;
    results.push({
      rule: "crossed-columns",
      severity: "info",
      message: `"${message.text}" from ${name(from)} to ${name(to)} crosses ${crossed.length} other columns (${crossed.map(({ label, name: short }) => label ?? short).join(", ")}). Put the participants that exchange the most messages next to each other.`,
      target: message.id,
    });
  }
  return results;
}
