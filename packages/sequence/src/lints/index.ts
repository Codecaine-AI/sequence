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

/** A message label or guard longer than this many characters is reported. */
export const LABEL_LENGTH_LIMIT = 40;

function messagesOf(items: readonly SequenceItem[]): SequenceMessage[] {
  return items.flatMap((item) =>
    item.kind === "message"
      ? [item]
      : item.kind === "fragment"
        ? item.operands.flatMap((operand) => messagesOf(operand.items))
        : []);
}

function guardsOf(items: readonly SequenceItem[]): { id: string; guard: string }[] {
  return items.flatMap((item) =>
    item.kind === "fragment"
      ? item.operands.flatMap((operand) => [
          ...(operand.guard ? [{ id: item.id, guard: operand.guard }] : []),
          ...guardsOf(operand.items),
        ])
      : []);
}

/**
 * Quality lints for a sequence document.
 * - `crossed-columns`: a message that crosses 2 or more other lifelines,
 *   which usually means the column order keeps two busy participants apart.
 * - `long-label`, `long-guard`: a message label or a guard longer than
 *   {@link LABEL_LENGTH_LIMIT} characters.
 * - `joined-calls`: one arrow whose label joins two calls with "then".
 * - `sync-without-return`: a sync call with no later return from the
 *   receiver to the caller, whose receiver next messages someone else.
 */
export function lintSequence(document: SequenceDocument): SequenceLintResult[] {
  const results = [...crossedColumns(document)];
  const messages = messagesOf(document.items);
  for (const message of messages) {
    if (message.text.length > LABEL_LENGTH_LIMIT) {
      results.push({
        rule: "long-label",
        severity: "info",
        message: `"${message.text}" has ${message.text.length} characters. Keep a label to ${LABEL_LENGTH_LIMIT} or fewer: name the call and only the arguments the reader needs.`,
        target: message.id,
      });
    }
    if (/\)\s*,?\s*then\s+[^\s(]+\(/i.test(message.text)) {
      results.push({
        rule: "joined-calls",
        severity: "info",
        message: `"${message.text}" joins two steps in one arrow. Draw one arrow per call, so each reply answers one call.`,
        target: message.id,
      });
    }
  }
  messages.forEach((message, index) => {
    if (message.line !== "sync" || message.from === message.to) return;
    const later = messages.slice(index + 1);
    if (later.some(({ line, from, to }) => line === "return" && from === message.to && to === message.from)) return;
    // Reported only when the receiver goes on to call someone else: then
    // the caller's wait never visibly ends.
    const next = later.find(({ from, to }) => from !== to && (from === message.to || to === message.to));
    if (!next || next.from !== message.to || next.to === message.from) return;
    results.push({
      rule: "sync-without-return",
      severity: "info",
      message: `"${message.text}" is a sync call with no return, and its receiver goes on to message others. Draw the return when the caller waits for it, or use -> when the caller does not wait.`,
      target: message.id,
    });
  });
  for (const { id, guard } of guardsOf(document.items)) {
    if (guard.length <= LABEL_LENGTH_LIMIT) continue;
    results.push({
      rule: "long-guard",
      severity: "info",
      message: `The guard "${guard}" has ${guard.length} characters. Keep a guard to ${LABEL_LENGTH_LIMIT} or fewer: state the condition only, and put a reason in a note.`,
      target: id,
    });
  }
  return results;
}

function crossedColumns(document: SequenceDocument): SequenceLintResult[] {
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
