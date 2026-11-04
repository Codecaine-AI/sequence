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

/** A message label longer than this many characters is reported. */
export const LABEL_LENGTH_LIMIT = 40;

/**
 * A code-call label, `name(arguments)`, longer than this many characters is
 * reported. It lists the brief's argument names, which are never cut or
 * abbreviated, so it gets more room than plain words.
 */
export const CALL_LABEL_LENGTH_LIMIT = 56;

/** A label that is one call with its arguments, such as `progress_add(accepted, baseRevision)`. */
const CALL_LABEL = /^[A-Za-z_][\w.]*\(.*\)$/;

/**
 * A guard longer than this many characters is reported. A guard copies
 * every condition the brief gives it, so it gets more room than a label.
 */
export const GUARD_LENGTH_LIMIT = 60;

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
 * - `leftward-call`: a call or async message to a column on the sender's
 *   left, when the flow reaches the receiver after the sender. One finding
 *   per sender and receiver pair.
 * - `long-label`: a message label longer than {@link LABEL_LENGTH_LIMIT}
 *   characters, or a code call longer than {@link CALL_LABEL_LENGTH_LIMIT}.
 *   `long-guard`: a guard longer than {@link GUARD_LENGTH_LIMIT}.
 * - `joined-calls`: one arrow whose label joins two calls with "then".
 */
export function lintSequence(document: SequenceDocument): SequenceLintResult[] {
  const results = [...crossedColumns(document), ...leftwardCalls(document)];
  const messages = messagesOf(document.items);
  for (const message of messages) {
    const limit = CALL_LABEL.test(message.text) ? CALL_LABEL_LENGTH_LIMIT : LABEL_LENGTH_LIMIT;
    if (message.text.length > limit) {
      results.push({
        rule: "long-label",
        severity: "info",
        message: `"${message.text}" has ${message.text.length} characters. Keep a label to ${limit} or fewer: name the call and only the arguments the brief names, with the brief's names unabbreviated.`,
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
  for (const { id, guard } of guardsOf(document.items)) {
    if (guard.length <= GUARD_LENGTH_LIMIT) continue;
    results.push({
      rule: "long-guard",
      severity: "info",
      message: `The guard "${guard}" has ${guard.length} characters. Cut it to ${GUARD_LENGTH_LIMIT} or fewer by dropping filler words. Keep every condition and remark the brief gives; only a reason given with "because" moves to a note.`,
      target: id,
    });
  }
  return results;
}

/**
 * The column order the skill's procedure starts from: the sender of the
 * first message, then each participant in the order it first receives a
 * message, a return included. A participant that never receives one ranks
 * by its first send.
 */
function flowRanks(messages: readonly SequenceMessage[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const first = messages[0];
  if (first) ranks.set(first.from, -1);
  messages.forEach(({ to }, index) => {
    if (!ranks.has(to)) ranks.set(to, index);
  });
  messages.forEach(({ from }, index) => {
    if (!ranks.has(from)) ranks.set(from, index);
  });
  return ranks;
}

function leftwardCalls(document: SequenceDocument): SequenceLintResult[] {
  const column = new Map(document.participants.map((participant, index) => [participant.id, index]));
  const name = (id: string): string => {
    const participant = document.participants[column.get(id)!]!;
    return participant.label ?? participant.name;
  };
  const messages = messagesOf(document.items);
  const ranks = flowRanks(messages);
  const reported = new Set<string>();
  const results: SequenceLintResult[] = [];
  for (const message of messages) {
    if (message.line === "return" || message.from === message.to) continue;
    const from = column.get(message.from);
    const to = column.get(message.to);
    if (from === undefined || to === undefined || to > from) continue;
    // A call back to a participant that the flow reached first is expected.
    if (ranks.get(message.to)! < ranks.get(message.from)!) continue;
    const pair = `${message.from}>${message.to}`;
    if (reported.has(pair)) continue;
    reported.add(pair);
    results.push({
      rule: "leftward-call",
      severity: "info",
      message: `"${message.text}" runs right to left, from ${name(message.from)} to ${name(message.to)}. Move ${name(message.to)} right of ${name(message.from)}: put the sender of the first message in column 1, then each participant in the order it first receives a message.`,
      target: message.id,
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
