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
 * - `leftward-call`: a call or async message to a column on the sender's
 *   left, when the flow reaches the receiver after the sender. One finding
 *   per sender and receiver pair.
 * - `long-label`, `long-guard`: a message label or a guard longer than
 *   {@link LABEL_LENGTH_LIMIT} characters.
 * - `joined-calls`: one arrow whose label joins two calls with "then".
 * - `sync-without-return`: a sync call with no later return from the
 *   receiver to the caller, whose receiver next messages someone else.
 * - `reply-inside-branch`: a sync call outside a fragment whose matching
 *   return is inside it. The receiver's bar then runs through the frame's
 *   top edge.
 */
export function lintSequence(document: SequenceDocument): SequenceLintResult[] {
  const results = [...crossedColumns(document), ...leftwardCalls(document)];
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
  results.push(...repliesInsideBranches(document.items));
  for (const { id, guard } of guardsOf(document.items)) {
    if (guard.length <= LABEL_LENGTH_LIMIT) continue;
    results.push({
      rule: "long-guard",
      severity: "info",
      message: `The guard "${guard}" has ${guard.length} characters. Cut it to ${LABEL_LENGTH_LIMIT} or fewer: keep only the condition, and move a reason or a remark such as "(proposed)" into a note.`,
      target: id,
    });
  }
  return results;
}

/** Every message in document order, with the fragments that enclose it, outermost first. */
function framedMessages(
  items: readonly SequenceItem[],
  frames: readonly { id: string; op: string }[] = [],
): { message: SequenceMessage; frames: readonly { id: string; op: string }[] }[] {
  return items.flatMap((item) =>
    item.kind === "message"
      ? [{ message: item, frames }]
      : item.kind === "fragment"
        ? item.operands.flatMap((operand) => framedMessages(operand.items, [...frames, { id: item.id, op: item.op }]))
        : []);
}

function repliesInsideBranches(items: readonly SequenceItem[]): SequenceLintResult[] {
  const flow = framedMessages(items);
  // A return answers the latest open call of its pair, as activation bars do.
  const replyOf = new Map<number, number>();
  const open = new Map<string, number[]>();
  flow.forEach(({ message }, index) => {
    if (message.from === message.to) return;
    if (message.line === "sync") {
      const pair = `${message.from}>${message.to}`;
      open.set(pair, [...(open.get(pair) ?? []), index]);
    } else if (message.line === "return") {
      const calls = open.get(`${message.to}>${message.from}`);
      const call = calls?.pop();
      if (call !== undefined) replyOf.set(call, index);
    }
  });
  const results: SequenceLintResult[] = [];
  for (const [callIndex, replyIndex] of replyOf) {
    const { message: call, frames } = flow[callIndex]!;
    const { message: reply, frames: replyFrames } = flow[replyIndex]!;
    if (replyFrames.length <= frames.length) continue;
    if (!frames.every((frame, depth) => replyFrames[depth]!.id === frame.id)) continue;
    const branch = replyFrames[frames.length]!;
    // Reported when the fragment branches on this call's result: until the
    // fragment opens, the receiver only answers the caller, and no other
    // fragment comes between them.
    const between = flow.slice(callIndex + 1);
    const fragmentStart = between.findIndex(({ frames: inner }) => inner.length > frames.length);
    if (between[fragmentStart]!.frames[frames.length]!.id !== branch.id) continue;
    const busy = between.slice(0, fragmentStart).some(({ message }) => message.from === call.to && message.to !== call.from);
    if (busy) continue;
    results.push({
      rule: "reply-inside-branch",
      severity: "info",
      message: `The reply "${reply.text}" to "${call.text}" is inside the ${branch.op} that follows the call, so the receiver's bar runs through the frame's top edge. Draw the call and its reply before the ${branch.op}, and let the guards name the result.`,
      target: call.id,
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
