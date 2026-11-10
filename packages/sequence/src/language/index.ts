import type {
  FragmentOp,
  MessageLine,
  NoteSide,
  SequenceDocument,
  SequenceFragment,
  SequenceItem,
  SequenceMessage,
  SequenceNote,
  SequenceOperand,
  SequenceParticipant,
} from "../schema";

export { WRITING_GUIDE } from "./writing-guide";

const INDENT = "  ";
const SAFE_VALUE = /^[A-Za-z0-9_()-]*$/;
const PARTICIPANT_KINDS = new Set(["actor", "participant"] as const);
const FRAGMENT_OPS = new Set(["alt", "opt", "loop"] as const);
const NOTE_SIDES = new Set(["over", "left", "right"] as const);

export interface SequenceProgramError {
  line: number;
  message: string;
}

export type ParseSequenceProgramResult =
  | { ok: true; document: SequenceDocument }
  | { ok: false; errors: SequenceProgramError[] };

interface SourceLine {
  indent: number;
  content: string;
  line: number;
}

interface Cursor {
  source: string;
  offset: number;
  line: number;
}

interface ParseState {
  errors: SequenceProgramError[];
  participants: SequenceParticipant[];
  participantIds: Map<number, string>;
  nextMessage: number;
  nextFragment: number;
  nextNote: number;
}

class LineParseError extends Error {
  readonly line: number;

  constructor(line: number, message: string) {
    super(message);
    this.line = line;
  }
}

function fail(line: number, message: string): never {
  throw new LineParseError(line, message);
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

function valueToken(value: string): string {
  return SAFE_VALUE.test(value) ? value : quoted(value);
}

function skipSpaces(cursor: Cursor): void {
  while (cursor.source[cursor.offset] === " ") cursor.offset += 1;
}

function readJsonString(cursor: Cursor): string {
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] !== '"') {
    fail(cursor.line, "expected a JSON-quoted string.");
  }
  const start = cursor.offset;
  let escaped = false;
  cursor.offset += 1;
  while (cursor.offset < cursor.source.length) {
    const character = cursor.source[cursor.offset];
    cursor.offset += 1;
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      try {
        const result: unknown = JSON.parse(cursor.source.slice(start, cursor.offset));
        if (typeof result !== "string") throw new Error("not a string");
        return result;
      } catch {
        fail(cursor.line, "malformed JSON string.");
      }
    }
  }
  fail(cursor.line, "unterminated JSON string.");
}

function readWord(cursor: Cursor): string {
  skipSpaces(cursor);
  const start = cursor.offset;
  while (cursor.offset < cursor.source.length && cursor.source[cursor.offset] !== " ") {
    cursor.offset += 1;
  }
  return cursor.source.slice(start, cursor.offset);
}

function readValue(cursor: Cursor): string {
  if (cursor.source[cursor.offset] === '"') return readJsonString(cursor);
  const start = cursor.offset;
  while (cursor.offset < cursor.source.length && cursor.source[cursor.offset] !== " ") {
    cursor.offset += 1;
  }
  const value = cursor.source.slice(start, cursor.offset);
  if (!SAFE_VALUE.test(value)) {
    fail(cursor.line, `unsafe value ${quoted(value)} must be JSON-quoted.`);
  }
  return value;
}

function readPositiveInteger(cursor: Cursor, description: string): number {
  skipSpaces(cursor);
  const start = cursor.offset;
  while (/\d/.test(cursor.source[cursor.offset] ?? "")) cursor.offset += 1;
  const token = cursor.source.slice(start, cursor.offset);
  const value = Number(token);
  if (!/^[1-9]\d*$/.test(token) || !Number.isSafeInteger(value)) {
    fail(cursor.line, `expected a positive integer ${description}.`);
  }
  return value;
}

function expectKey(cursor: Cursor, key: string): void {
  skipSpaces(cursor);
  if (!cursor.source.startsWith(`${key}=`, cursor.offset)) {
    fail(cursor.line, `expected \`${key}=\`.`);
  }
  cursor.offset += key.length + 1;
}

function tryKey(cursor: Cursor, key: string): boolean {
  skipSpaces(cursor);
  if (!cursor.source.startsWith(`${key}=`, cursor.offset)) return false;
  cursor.offset += key.length + 1;
  return true;
}

function assertEnd(cursor: Cursor): void {
  skipSpaces(cursor);
  if (cursor.offset !== cursor.source.length) {
    fail(cursor.line, `unexpected text ${quoted(cursor.source.slice(cursor.offset))}.`);
  }
}

function recordError(state: ParseState, error: unknown, fallbackLine: number): void {
  if (error instanceof LineParseError) {
    state.errors.push({ line: error.line, message: error.message });
  } else {
    state.errors.push({ line: fallbackLine, message: "could not parse this line." });
  }
}

function sourceLines(source: string, errors: SequenceProgramError[]): SourceLine[] {
  const lines: SourceLine[] = [];
  source.replace(/\r\n?/g, "\n").split("\n").forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === "") return;
    if (raw.includes("\t")) {
      errors.push({ line, message: "tabs are not valid indentation or content." });
      return;
    }
    const leading = raw.length - raw.trimStart().length;
    if (leading % INDENT.length !== 0) {
      errors.push({ line, message: "indentation must use exactly 2 spaces per level." });
      return;
    }
    lines.push({ indent: leading / INDENT.length, content: raw.slice(leading).trimEnd(), line });
  });
  return lines;
}

function parseTitle(line: SourceLine): string {
  if (line.indent !== 0) fail(line.line, "the title line must not be indented.");
  const cursor: Cursor = { source: line.content.slice("title".length), offset: 0, line: line.line };
  const title = readJsonString(cursor);
  assertEnd(cursor);
  return title;
}

function parseParticipant(line: SourceLine, state: ParseState): void {
  if (line.indent !== 0) fail(line.line, "participant declarations must not be indented.");
  const cursor: Cursor = {
    source: line.content.slice("participant".length),
    offset: 0,
    line: line.line,
  };
  const ordinal = readPositiveInteger(cursor, "participant number");
  expectKey(cursor, "text");
  const name = readValue(cursor);
  let kind: SequenceParticipant["kind"] = "participant";
  let label: string | undefined;
  let stereotype: string | undefined;
  if (tryKey(cursor, "kind")) {
    const candidate = readWord(cursor);
    if (!PARTICIPANT_KINDS.has(candidate as "actor" | "participant")) {
      fail(line.line, `unknown participant kind ${quoted(candidate)}.`);
    }
    kind = candidate as SequenceParticipant["kind"];
  }
  if (tryKey(cursor, "label")) label = readValue(cursor);
  if (tryKey(cursor, "stereotype")) stereotype = readValue(cursor);
  assertEnd(cursor);

  const expected = state.participants.length + 1;
  if (ordinal !== expected) {
    state.errors.push({
      line: line.line,
      message: `participant numbers must be dense and in declaration order; expected ${expected}, received ${ordinal}.`,
    });
  }
  if (state.participantIds.has(ordinal)) {
    state.errors.push({ line: line.line, message: `participant number ${ordinal} is declared more than once.` });
    return;
  }
  const id = `p${ordinal}`;
  state.participantIds.set(ordinal, id);
  state.participants.push({
    id,
    name,
    kind,
    ...(label !== undefined ? { label } : {}),
    ...(stereotype !== undefined ? { stereotype } : {}),
  });
}

function participantReference(ordinal: number, line: number, state: ParseState): string {
  const id = state.participantIds.get(ordinal);
  if (id === undefined) {
    fail(line, `reference to unknown participant number ${ordinal}.`);
  }
  return id;
}

function parseMessage(line: SourceLine, state: ParseState): SequenceMessage {
  const cursor: Cursor = { source: line.content, offset: 0, line: line.line };
  const fromNumber = readPositiveInteger(cursor, "message sender");
  skipSpaces(cursor);
  let arrow: "-->" | "->" | ">";
  if (cursor.source.startsWith("-->", cursor.offset)) arrow = "-->";
  else if (cursor.source.startsWith("->", cursor.offset)) arrow = "->";
  else if (cursor.source.startsWith(">", cursor.offset)) arrow = ">";
  else fail(line.line, "expected a message arrow (`>`, `->`, or `-->`).");
  cursor.offset += arrow.length;
  const toNumber = readPositiveInteger(cursor, "message recipient");
  expectKey(cursor, "text");
  const text = readValue(cursor);
  assertEnd(cursor);
  const from = participantReference(fromNumber, line.line, state);
  const to = participantReference(toNumber, line.line, state);
  const lineKind: MessageLine = arrow === ">" ? "sync" : arrow === "->" ? "async" : "return";
  const message: SequenceMessage = {
    kind: "message",
    id: `m${state.nextMessage}`,
    from,
    to,
    line: lineKind,
    text,
  };
  state.nextMessage += 1;
  return message;
}

function parseNote(line: SourceLine, state: ParseState): SequenceNote {
  const cursor: Cursor = { source: line.content.slice("note".length), offset: 0, line: line.line };
  skipSpaces(cursor);
  const sideStart = cursor.offset;
  while (/[A-Za-z]/.test(cursor.source[cursor.offset] ?? "")) cursor.offset += 1;
  const side = cursor.source.slice(sideStart, cursor.offset) as NoteSide;
  if (!NOTE_SIDES.has(side)) fail(line.line, `unknown note side ${quoted(side)}.`);
  if (cursor.source[cursor.offset] !== "=") fail(line.line, "expected `=` after the note side.");
  cursor.offset += 1;
  const anchorNumber = readPositiveInteger(cursor, "note anchor");
  expectKey(cursor, "text");
  const text = readValue(cursor);
  assertEnd(cursor);
  const note: SequenceNote = {
    kind: "note",
    id: `n${state.nextNote}`,
    anchor: participantReference(anchorNumber, line.line, state),
    side,
    text,
  };
  state.nextNote += 1;
  return note;
}

function parseFragmentHeader(line: SourceLine, op: FragmentOp): string {
  const cursor: Cursor = { source: line.content.slice(op.length), offset: 0, line: line.line };
  expectKey(cursor, "guard");
  const guard = readValue(cursor);
  assertEnd(cursor);
  return guard;
}

function parseElseHeader(line: SourceLine): string | undefined {
  const cursor: Cursor = { source: line.content.slice("else".length), offset: 0, line: line.line };
  let guard: string | undefined;
  skipSpaces(cursor);
  if (cursor.offset < cursor.source.length) {
    expectKey(cursor, "guard");
    guard = readValue(cursor);
  }
  assertEnd(cursor);
  return guard;
}

interface ParsedItems {
  items: SequenceItem[];
  next: number;
}

function parseItems(
  lines: SourceLine[],
  start: number,
  expectedIndent: number,
  state: ParseState,
  stopAtElse: boolean,
): ParsedItems {
  const items: SequenceItem[] = [];
  let next = start;
  while (next < lines.length) {
    const line = lines[next]!;
    if (line.indent < expectedIndent) break;
    if (line.indent > expectedIndent) {
      state.errors.push({
        line: line.line,
        message: `expected ${expectedIndent * INDENT.length} spaces of indentation.`,
      });
      next += 1;
      continue;
    }
    if (line.content === "else" || line.content.startsWith("else ")) {
      if (stopAtElse) break;
      state.errors.push({ line: line.line, message: "`else` is only legal directly after an `alt` operand." });
      next += 1;
      continue;
    }

    if (/^[1-9]\d*(?: |$)/.test(line.content)) {
      try {
        items.push(parseMessage(line, state));
      } catch (error) {
        recordError(state, error, line.line);
      }
      next += 1;
      continue;
    }

    if (line.content === "note" || line.content.startsWith("note ")) {
      try {
        items.push(parseNote(line, state));
      } catch (error) {
        recordError(state, error, line.line);
      }
      next += 1;
      continue;
    }

    const op = (["alt", "opt", "loop"] as const).find(
      (candidate) => line.content === candidate || line.content.startsWith(`${candidate} `),
    );
    if (op && FRAGMENT_OPS.has(op)) {
      let guard: string;
      try {
        guard = parseFragmentHeader(line, op);
      } catch (error) {
        recordError(state, error, line.line);
        next += 1;
        continue;
      }
      const fragment: SequenceFragment = {
        kind: "fragment",
        id: `f${state.nextFragment}`,
        op,
        operands: [],
      };
      state.nextFragment += 1;
      const first = parseItems(lines, next + 1, expectedIndent + 1, state, op === "alt");
      fragment.operands.push({ guard, items: first.items });
      next = first.next;
      if (op === "alt") {
        while (
          next < lines.length
          && lines[next]!.indent === expectedIndent
          && (lines[next]!.content === "else" || lines[next]!.content.startsWith("else "))
        ) {
          const elseLine = lines[next]!;
          let elseGuard: string | undefined;
          try {
            elseGuard = parseElseHeader(elseLine);
          } catch (error) {
            recordError(state, error, elseLine.line);
            next += 1;
            continue;
          }
          const operand = parseItems(lines, next + 1, expectedIndent + 1, state, true);
          fragment.operands.push({ ...(elseGuard !== undefined ? { guard: elseGuard } : {}), items: operand.items });
          next = operand.next;
        }
      }
      items.push(fragment);
      continue;
    }

    state.errors.push({ line: line.line, message: `unknown sequence item ${quoted(line.content)}.` });
    next += 1;
  }
  return { items, next };
}

/** Parse the disposable, indentation-nested sequence program. Bad input never throws. */
export function parseSequenceProgram(source: string): ParseSequenceProgramResult {
  const errors: SequenceProgramError[] = [];
  const lines = sourceLines(source, errors);
  const state: ParseState = {
    errors,
    participants: [],
    participantIds: new Map(),
    nextMessage: 1,
    nextFragment: 1,
    nextNote: 1,
  };
  let next = 0;
  let title: string | undefined;

  if (lines[next] && (lines[next]!.content === "title" || lines[next]!.content.startsWith("title "))) {
    try {
      title = parseTitle(lines[next]!);
    } catch (error) {
      recordError(state, error, lines[next]!.line);
    }
    next += 1;
  }

  while (next < lines.length && lines[next]!.content !== "seq") {
    const line = lines[next]!;
    if (line.content === "participant" || line.content.startsWith("participant ")) {
      try {
        parseParticipant(line, state);
      } catch (error) {
        recordError(state, error, line.line);
      }
    } else {
      state.errors.push({ line: line.line, message: "expected a participant declaration or the `seq` header." });
    }
    next += 1;
  }

  let items: SequenceItem[] = [];
  if (next >= lines.length) {
    const line = lines.length > 0 ? lines[lines.length - 1]!.line : 1;
    state.errors.push({ line, message: "missing `seq` header." });
  } else {
    const header = lines[next]!;
    if (header.indent !== 0) {
      state.errors.push({ line: header.line, message: "the `seq` header must not be indented." });
    }
    next += 1;
    const parsed = parseItems(lines, next, 1, state, false);
    items = parsed.items;
    next = parsed.next;
    while (next < lines.length) {
      const line = lines[next]!;
      state.errors.push({ line: line.line, message: "unexpected content after the sequence body." });
      next += 1;
    }
  }

  if (state.errors.length > 0) return { ok: false, errors: state.errors };
  return {
    ok: true,
    document: {
      version: 1,
      id: "sequence",
      ...(title !== undefined ? { title } : {}),
      participants: state.participants,
      items,
      style: {},
    },
  };
}

function participantNumbers(document: SequenceDocument): Map<string, number> {
  const numbers = new Map<string, number>();
  document.participants.forEach((participant, index) => {
    if (numbers.has(participant.id)) {
      throw new TypeError(`Duplicate participant id ${quoted(participant.id)} cannot be serialized.`);
    }
    numbers.set(participant.id, index + 1);
  });
  return numbers;
}

function reference(numbers: Map<string, number>, id: string): number {
  const number = numbers.get(id);
  if (number === undefined) throw new TypeError(`Unknown participant id ${quoted(id)} cannot be serialized.`);
  return number;
}

function serializeItems(
  items: SequenceItem[],
  depth: number,
  numbers: Map<string, number>,
  lines: string[],
): void {
  const prefix = INDENT.repeat(depth);
  for (const item of items) {
    if (item.kind === "message") {
      const arrow = item.line === "sync" ? ">" : item.line === "async" ? "->" : "-->";
      lines.push(`${prefix}${reference(numbers, item.from)} ${arrow} ${reference(numbers, item.to)} text=${valueToken(item.text)}`);
      continue;
    }
    if (item.kind === "note") {
      lines.push(`${prefix}note ${item.side}=${reference(numbers, item.anchor)} text=${valueToken(item.text)}`);
      continue;
    }
    if (item.operands.length === 0) {
      throw new TypeError(`${item.op} fragment ${quoted(item.id)} must have at least one operand.`);
    }
    if (item.op !== "alt" && item.operands.length !== 1) {
      throw new TypeError(`${item.op} fragment ${quoted(item.id)} must have exactly one operand.`);
    }
    const first = item.operands[0]!;
    if (first.guard === undefined) {
      throw new TypeError(`${item.op} fragment ${quoted(item.id)} must have a guard on its first operand.`);
    }
    lines.push(`${prefix}${item.op} guard=${valueToken(first.guard)}`);
    serializeItems(first.items, depth + 1, numbers, lines);
    for (const operand of item.operands.slice(1)) {
      lines.push(`${prefix}else${operand.guard === undefined ? "" : ` guard=${valueToken(operand.guard)}`}`);
      serializeItems(operand.items, depth + 1, numbers, lines);
    }
  }
}

/** Serialize a document's structure to the one canonical sequence program form. */
export function serializeSequenceProgram(document: SequenceDocument): string {
  const lines: string[] = [];
  if (document.title !== undefined) lines.push(`title ${quoted(document.title)}`);
  document.participants.forEach((participant, index) => {
    let line = `participant ${index + 1} text=${valueToken(participant.name)}`;
    if (participant.kind === "actor") line += " kind=actor";
    if (participant.label !== undefined) line += ` label=${valueToken(participant.label)}`;
    if (participant.stereotype !== undefined) line += ` stereotype=${valueToken(participant.stereotype)}`;
    lines.push(line);
  });
  lines.push("");
  lines.push("seq");
  serializeItems(document.items, 1, participantNumbers(document), lines);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// docs-system page → Markdown. Unknown block types and attributes throw, so a
// grammar page the renderer cannot carry fails the write instead of losing text.

type Run = { insert: string; attributes?: Record<string, unknown> };
type Cell = string | Run[];
type Block = { id: string; type: string; props: Record<string, unknown>; text?: Run[]; children: string[] };
export type DocPage = { title: string; root: string; blocks: Record<string, Block> };

const codeSpan = (text: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length));
  const ticks = "`".repeat(longest + 1);
  return longest > 0 || text.startsWith(" ") ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`;
};

function inline(runs: readonly Run[]): string {
  return runs.map(run => {
    const attributes = run.attributes ?? {};
    for (const key of Object.keys(attributes)) {
      if (key !== "bold" && key !== "code") throw new Error(`Unsupported text attribute: ${key}`);
    }
    let text = attributes.code ? codeSpan(run.insert) : run.insert;
    if (attributes.bold) {
      const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
      text = body ? `${lead}**${body}**${trail}` : text;
    }
    return text;
  }).join("");
}

const cell = (value: Cell): string =>
  (typeof value === "string" ? value : inline(value)).replace(/\|/g, "\\|").replace(/\n/g, " ");

function fence(code: string, language: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map(run => run.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${language}\n${code}\n${ticks}`;
}

function renderList(page: DocPage, ids: readonly string[], indent: string): string {
  let number = 0;
  let ordered: boolean | undefined;
  return ids.map(id => {
    const block = page.blocks[id]!;
    if (block.type !== "list-item") throw new Error(`List ${id} holds a ${block.type} block`);
    const isOrdered = block.props.ordered === true;
    number = isOrdered === ordered ? number + 1 : 1;
    ordered = isOrdered;
    const marker = isOrdered ? `${number}. ` : "- ";
    const line = `${indent}${marker}${inline(block.text ?? [])}`;
    return block.children.length ? `${line}\n${renderList(page, block.children, indent + " ".repeat(marker.length))}` : line;
  }).join("\n");
}

function renderBlock(page: DocPage, block: Block): string {
  if (block.type !== "list-item" && block.children.length) throw new Error(`Block ${block.id} has unsupported children`);
  switch (block.type) {
    case "heading": return `${"#".repeat(Number(block.props.level))} ${inline(block.text ?? [])}`;
    case "paragraph": return inline(block.text ?? []);
    case "code": return fence(inline((block.text ?? []).map(run => ({ insert: run.insert }))), String(block.props.language ?? ""));
    case "structured-table": {
      const columns = block.props.columns as Cell[];
      const rows = block.props.rows as Cell[][];
      return [columns, columns.map(() => "---"), ...rows]
        .map((row, index) => `| ${row.map(value => (index === 1 ? String(value) : cell(value))).join(" | ")} |`)
        .join("\n");
    }
    default: throw new Error(`Unsupported block type ${block.type} (${block.id})`);
  }
}

/** Render a docs-system page's text, headings, lists, tables and code blocks to Markdown. */
export function renderDocPage(page: DocPage): string {
  const parts: string[] = [`# ${page.title}`];
  const top = page.blocks[page.root]!.children;
  for (let index = 0; index < top.length;) {
    const block = page.blocks[top[index]!]!;
    if (block.type === "list-item") {
      let end = index;
      while (end < top.length && page.blocks[top[end]!]!.type === "list-item") end++;
      parts.push(renderList(page, top.slice(index, end), ""));
      index = end;
    } else {
      parts.push(renderBlock(page, block));
      index++;
    }
  }
  return parts.join("\n\n");
}

/** The body of one `## ` section of a Markdown file, without its heading. */
export function markdownSection(markdown: string, headingPrefix: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex(line => line.startsWith(`## ${headingPrefix}`));
  if (start < 0) throw new Error(`No "## ${headingPrefix}" section`);
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim();
}

export type {
  SequenceDocument,
  SequenceFragment,
  SequenceItem,
  SequenceMessage,
  SequenceNote,
  SequenceOperand,
};
