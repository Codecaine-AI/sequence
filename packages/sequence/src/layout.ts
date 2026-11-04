import type {
  FragmentOp,
  MessageLine,
  NoteSide,
  SequenceDocument,
  SequenceFragment,
  SequenceItem,
  SequenceMessage,
  SequenceNote,
  SequenceParticipant,
} from "./schema";
import {
  resolveSequenceTextMetrics,
  sequenceFont,
  singleLineText,
  type ResolvedSequenceTextMetrics,
  type SeqFont,
  type SequenceMeasureInput,
} from "./text";

export {
  SEQUENCE_TYPOGRAPHY,
  sequenceFont,
  singleLineText,
  type SeqFont,
  type SequenceMeasureInput,
  type SequenceTextMeasure,
  type SequenceTextMetrics,
  type SequenceTextRole,
  type SequenceTextStyle,
  type SequenceTextWrap,
} from "./text";

/** Base (scale = 1) dimensions used by the deterministic sequence layout. */
export const SEQUENCE_LAYOUT = {
  GRID: 8,
  COLUMN_GAP: 140,
  HEADER_H: 40,
  FOOTER_GAP: 24,
  HEADER_PAD_X: 16,
  ROW_H: 40,
  ACTIVATION_W: 12,
  FRAG_PAD: 12,
  FRAG_TAB_H: 20,
  /**
   * Vertical clearance between a fragment frame and a neighboring message or
   * note. Margins collapse: two sibling frames sit one margin apart, not two.
   */
  FRAG_MARGIN_Y: 24,
  /** Air between the tab/guard row and a fragment's first item. */
  FRAG_INNER_TOP: 14,
  /**
   * Air between a fragment's last item and its bottom edge. A nested frame
   * that closes its operand adds no margin of its own, so nested frames that
   * close together step their bottom edges by this much, as FRAG_PAD steps
   * their sides.
   */
  FRAG_INNER_BOTTOM: 12,
  /** Air above a nested frame that opens its operand, below the tab or guard row. */
  FRAG_NESTED_TOP: 8,
  /** Clearance above and below each dashed operand divider. */
  FRAG_DIVIDER_GAP: 10,
  /** Reserved row for an operand guard label rendered below a divider. */
  FRAG_GUARD_H: 22,
  /** Extra clearance above and below note boxes. */
  NOTE_MARGIN_Y: 8,
  NOTE_W: 160,
  MARGIN: 24,
  SELF_LOOP_W: 40,
} as const;

export interface SeqPoint {
  x: number;
  y: number;
}

export interface SeqRect extends SeqPoint {
  width: number;
  height: number;
}

export interface SeqTextAnchor extends SeqPoint {
  anchor: "start" | "middle" | "end";
}

export interface SequenceParticipantLayout {
  id: string;
  name: string;
  label?: string;
  stereotype?: string;
  kind: SequenceParticipant["kind"];
  /** Lifeline center; `centerX` is retained as the more explicit alias. */
  x: number;
  centerX: number;
  header: SeqRect;
  actor: boolean;
  labelAnchor: SeqTextAnchor;
  stereotypeAnchor?: SeqTextAnchor;
}

export interface SequenceLifelineSegment {
  participantId: string;
  x: number;
  y1: number;
  y2: number;
}

interface SequenceRowBase {
  id: string;
  y: number;
  depth: number;
}

export interface SequenceMessageLayout extends SequenceRowBase {
  kind: "message";
  from: string;
  to: string;
  line: MessageLine;
  text: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  selfLoop?: SeqPoint[];
  label: SeqTextAnchor;
  /**
   * The label's measured text box plus {@link LABEL_BOX_PAD}. The renderer
   * fills it with the background so no line shows through the text.
   */
  labelBox: SeqRect;
}

export interface SequenceFragmentGuardLayout {
  operand: number;
  guard?: string;
  /** Already bracketed for direct SVG rendering. */
  label: string;
  anchor: SeqTextAnchor;
  /** The guard's text box plus {@link LABEL_BOX_PAD}; empty when there is no label. */
  box: SeqRect;
}

export interface SequenceFragmentLayout extends SequenceRowBase {
  kind: "fragment";
  op: FragmentOp;
  outer: SeqRect;
  tab: SeqRect;
  /** The five points of the UML operator tab, including its angled dog-ear. */
  tabPath: SeqPoint[];
  dividerYs: number[];
  guardLabels: SequenceFragmentGuardLayout[];
  participantIds: string[];
}

export interface SequenceNoteLayout extends SequenceRowBase {
  kind: "note";
  anchorId: string;
  side: NoteSide;
  text: string;
  /**
   * Display lines: every explicit "\n" starts a line, and longer lines wrap
   * at the note's content width (box width minus the label inset per side).
   */
  lines: string[];
  /** Scaled distance between line baselines. */
  lineHeight: number;
  box: SeqRect;
  /** Baseline of the first line; line `i` sits at `label.y + i * lineHeight`. */
  label: SeqTextAnchor;
  /** Three points describing the folded corner. */
  foldPath: SeqPoint[];
}

/**
 * The diagram title. It never widens the diagram: a title wider than the
 * content width (`width - 2 * margin`) wraps there. The participant row sits
 * below the title's last line, at least one row gap below the top margin.
 */
export interface SequenceTitleLayout {
  text: string;
  /** Baseline of the first line; line `i` sits at `anchor.y + i * lineHeight`. */
  anchor: SeqTextAnchor;
  lines: string[];
  /** Scaled distance between line baselines. */
  lineHeight: number;
}

export type SequenceLayoutRow =
  | SequenceMessageLayout
  | SequenceFragmentLayout
  | SequenceNoteLayout;

export interface SequenceActivationLayout {
  participantId: string;
  level: number;
  rect: SeqRect;
  startMessageId: string;
  endMessageId?: string;
}

export interface SequenceLayout {
  width: number;
  height: number;
  scale: number;
  title?: SequenceTitleLayout;
  participants: SequenceParticipantLayout[];
  participantFooters: SequenceParticipantLayout[];
  lifelines: SequenceLifelineSegment[];
  rows: SequenceLayoutRow[];
  messages: SequenceMessageLayout[];
  fragments: SequenceFragmentLayout[];
  notes: SequenceNoteLayout[];
  activations: SequenceActivationLayout[];
}

interface ScopeMessageEvent {
  type: "message";
  row: SequenceMessageLayout;
}

interface ScopeFragmentEvent {
  type: "fragment";
  frame: SequenceFragmentLayout;
  operands: LayoutScope[];
  /** Top of each operand's content band, just below the tab or divider. */
  operandTops: number[];
}

type ScopeEvent = ScopeMessageEvent | ScopeFragmentEvent;

interface LayoutScope {
  startY: number;
  endY: number;
  events: ScopeEvent[];
}

interface MutableActivation {
  participantId: string;
  callerId: string;
  level: number;
  rect: SeqRect;
  startMessageId: string;
  endMessageId?: string;
  /**
   * Set on a bar for a sync call with no matching return: where the bar ends
   * if no later row of its lifeline extends it.
   */
  shortEnd?: number;
  /** Frames this bar enters and ends inside, outermost last-recorded. */
  cuts: ActivationCut[];
}

/**
 * A frame that a bar enters from above and ends inside. The bar stops above
 * the frame and continues as one piece per operand, so it never crosses a
 * frame edge or divider that its call does not enclose.
 */
interface ActivationCut {
  top: number;
  bottom: number;
  pieces: { top: number; bottom: number }[];
}

interface ActivationClosure {
  endY: number;
  endMessageId?: string;
}

/**
 * Inter's descender is 0.242 em; text boxes reserve 0.25 em below the last
 * baseline.
 */
const DESCENT_EM = 0.25;
/** Inter's ascender (0.969 em): the tallest glyph, accents included. */
const ASCENT_EM = 0.97;
/**
 * Base px a label's background box reaches past its glyphs, per side. The
 * vertical pad keeps a clear gap between a lifeline's end and the glyphs,
 * so the line reads as stopping at the label, not running through it. A
 * message label's box also reaches down to its arrow.
 */
export const LABEL_BOX_PAD = { x: 3, y: 4 } as const;
/** Base px a label's background box reaches above its glyphs. */
const LABEL_HALO = LABEL_BOX_PAD.y;
/** Base px between an activation bar and an over note moved beside it. */
const NOTE_BAR_GAP = 4;
/** Base px from the top margin to the title's first baseline. */
const TITLE_BASELINE = 18;

/**
 * Computes all sequence geometry without consulting the DOM. Text metrics are
 * the only environment-dependent input. By default widths and line breaks
 * come from `@codecaine-ai/text-measure`, exact once the host has loaded the
 * bundled fonts (`useHarfBuzz()` headless, `useBrowserFonts()` in a browser);
 * re-run layout when its backend changes. Hosts may instead pass a bare
 * measurer, or a {@link SequenceTextMetrics} object whose optional `wrap`
 * breaks note and title lines (otherwise they wrap greedily over `measure`).
 * Every text is measured in the exact font the SVG renderer draws it with
 * ({@link SEQUENCE_TYPOGRAPHY}), as the string it draws
 * ({@link singleLineText}).
 */
export function layoutSequence(
  doc: SequenceDocument,
  measure?: SequenceMeasureInput,
): SequenceLayout {
  const metrics = resolveSequenceTextMetrics(measure);
  let hints = NO_HINTS;
  let pass = computeLayout(doc, metrics, hints);
  // Activation nesting comes out of a pass but decides column spacing: nested
  // bars move message docking points into the label's span and reach towards
  // notes. Bars nest the same way at any spacing, so one more pass reserves
  // that room. The title wraps at the final width, which vertical placement
  // never changes, so the last pass only moves everything below it down.
  // An over note on an active bar moves beside the bar, which needs a
  // note's width of room; which notes do comes out of a pass too.
  if (
    pass.dockingExcess.size > 0
    || pass.notesBesideBars.size > 0
    || (pass.activationDepth.size > 0 && pass.layout.notes.length > 0)
  ) {
    hints = {
      ...hints,
      activationDepth: pass.activationDepth,
      dockingExcess: pass.dockingExcess,
      notesBesideBars: pass.notesBesideBars,
    };
    pass = computeLayout(doc, metrics, hints);
  }
  const titleLineCount = pass.layout.title?.lines.length ?? 1;
  return titleLineCount > 1
    ? computeLayout(doc, metrics, { ...hints, titleLineCount }).layout
    : pass.layout;
}

/** Results of an earlier pass that a later pass lays out around. */
interface LayoutHints {
  titleLineCount: number;
  /** Deepest activation level per participant id, where deeper than 0. */
  activationDepth: ReadonlyMap<string, number>;
  /**
   * Per message id: how much further inside the span its arrow docks than
   * on unnested bars (nested bars step right by a third of a bar per level).
   */
  dockingExcess: ReadonlyMap<string, number>;
  /** Ids of over notes that an activation bar of their own lifeline runs through. */
  notesBesideBars: ReadonlySet<string>;
}

const NO_HINTS: LayoutHints = {
  titleLineCount: 1,
  activationDepth: new Map(),
  dockingExcess: new Map(),
  notesBesideBars: new Set(),
};

interface LayoutPass extends Omit<LayoutHints, "titleLineCount"> {
  layout: SequenceLayout;
}

function computeLayout(
  doc: SequenceDocument,
  metrics: ResolvedSequenceTextMetrics,
  { titleLineCount, activationDepth, dockingExcess, notesBesideBars }: LayoutHints,
): LayoutPass {
  const rawScale = doc.style.scale;
  const scale = typeof rawScale === "number" && Number.isFinite(rawScale) && rawScale > 0
    ? rawScale
    : 1;
  const unit = (value: number): number => value * scale;
  // Per-element geometry overrides (base px, multiplied by scale via unit()).
  // Invalid values fall back to the pinned layout constants.
  const styleLength = (value: number | undefined, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
  const margin = styleLength(doc.style.surface?.margin, SEQUENCE_LAYOUT.MARGIN);
  const columnGap = styleLength(doc.style.surface?.columnGap, SEQUENCE_LAYOUT.COLUMN_GAP);
  const rowGap = styleLength(doc.style.surface?.rowGap, SEQUENCE_LAYOUT.ROW_H);
  const headerPadX = styleLength(doc.style.participant?.padding, SEQUENCE_LAYOUT.HEADER_PAD_X);
  const activationW = styleLength(doc.style.activation?.width, SEQUENCE_LAYOUT.ACTIVATION_W);
  const fragPad = styleLength(doc.style.fragment?.padding, SEQUENCE_LAYOUT.FRAG_PAD);
  const notePad = styleLength(doc.style.note?.padding, 8);
  const labelGap = styleLength(doc.style.message?.labelGap, 6);
  // Each font is exactly the one the SVG renderer paints for that text.
  const participantFont = sequenceFont("participant", scale);
  const stereotypeFont = sequenceFont("stereotype", scale);
  const messageFont = sequenceFont("message", scale);
  const noteFont = sequenceFont("note", scale);
  const fragmentOpFont = sequenceFont("fragmentOp", scale);
  const guardFont = sequenceFont("guard", scale);
  const titleFont = sequenceFont("title", scale);
  const safeMeasure = metrics.measure;

  // The title band holds every title line plus the last line's descent and a
  // grid step of air. It stays at least one row gap tall, as before, so small
  // row gaps no longer pull the participant row up into the title.
  const titleLineHeight = titleFont.lineHeight ?? titleFont.size;
  const titleBand = Math.max(
    unit(rowGap),
    unit(TITLE_BASELINE + SEQUENCE_LAYOUT.GRID) + titleFont.size * DESCENT_EM,
  ) + (titleLineCount - 1) * titleLineHeight;
  const headerY = unit(margin) + (doc.title ? titleBand : 0);
  const headerWidths = doc.participants.map((participant) => {
    const display = participant.label ?? participant.name;
    const textWidth = Math.max(
      safeMeasure(display, participantFont),
      participant.stereotype ? safeMeasure(`«${participant.stereotype}»`, stereotypeFont) : 0,
    );
    return Math.max(unit(64), textWidth + unit(headerPadX * 2));
  });

  const maxFragmentDepth = (items: SequenceItem[], depth = 0): number => items.reduce(
    (maximum, item) => item.kind === "fragment"
      ? Math.max(
          maximum,
          depth + 1,
          ...item.operands.map((operand) => maxFragmentDepth(operand.items, depth + 1)),
        )
      : maximum,
    depth,
  );

  // Reserve a note-width gutter on both sides. Each enclosing fragment grows
  // by one pad, so include nesting depth to keep even deeply nested notes in
  // the positive viewBox without a later coordinate translation.
  const sideGutter = unit(
    margin
      + SEQUENCE_LAYOUT.NOTE_W
      + fragPad * (maxFragmentDepth(doc.items) + 1),
  );
  const centers: number[] = [];
  for (let index = 0; index < doc.participants.length; index += 1) {
    if (index === 0) {
      centers.push(Math.max(sideGutter, unit(margin) + headerWidths[index]! / 2));
      continue;
    }
    const previousWidth = headerWidths[index - 1]!;
    const width = headerWidths[index]!;
    const separation = Math.max(
      unit(columnGap),
      previousWidth / 2 + width / 2 + unit(SEQUENCE_LAYOUT.GRID * 2),
    );
    centers.push(centers[index - 1]! + separation);
  }

  // Widen column spans before placing participants, including inside nested
  // combined fragments. Message labels need room between the activation bars;
  // side and over notes must stop short of the neighbouring lifeline and its
  // activation bar.
  const widenSpan = (left: number, right: number, required: number): void => {
    const extra = required - (centers[right]! - centers[left]!);
    if (extra <= 0) return;
    for (let index = left + 1; index < centers.length; index += 1) {
      centers[index]! += extra * Math.min(index - left, right - left) / (right - left);
    }
  };
  const participantIndex = (id: string): number =>
    doc.participants.findIndex((participant) => participant.id === id);
  const noteClearance = unit(activationW / 2 + SEQUENCE_LAYOUT.GRID);
  // Nested bars step right by a third of a bar per level, so a lifeline's
  // bars reach further right than left.
  const nestedBarReach = (index: number): number =>
    unit(activationW / 3) * (activationDepth.get(doc.participants[index]!.id) ?? 0);
  const reserveColumnWidths = (items: SequenceItem[], fragmentDepth: number): void => {
    for (const item of items) {
      if (item.kind === "fragment") {
        for (const operand of item.operands) reserveColumnWidths(operand.items, fragmentDepth + 1);
      } else if (item.kind === "message") {
        if (item.from === item.to) continue;
        const from = participantIndex(item.from);
        const to = participantIndex(item.to);
        if (from < 0 || to < 0) continue;
        widenSpan(
          Math.min(from, to),
          Math.max(from, to),
          safeMeasure(item.text, messageFont)
            + unit(activationW * 2 + 24)
            + (dockingExcess.get(item.id) ?? 0),
        );
      } else {
        const index = participantIndex(item.anchor);
        if (index < 0) continue;
        // How far the box reaches from its own lifeline: side notes sit one
        // fragment pad out; over notes straddle it, nudged right by half a
        // bar when an activation runs through them. Every enclosing frame
        // adds one more pad around the box.
        // An over note that a bar runs through sits beside the bar instead.
        const frameReach = unit(fragPad) * fragmentDepth;
        const sideReach = unit(fragPad + SEQUENCE_LAYOUT.NOTE_W) + frameReach;
        const overReach = unit(SEQUENCE_LAYOUT.NOTE_W / 2) + frameReach;
        const besideBar = item.side === "over" && notesBesideBars.has(item.id);
        const besideReach = unit(activationW / 2 + NOTE_BAR_GAP + SEQUENCE_LAYOUT.NOTE_W)
          + nestedBarReach(index) + frameReach;
        const rightReach = item.side === "right"
          ? sideReach
          : besideBar ? besideReach : item.side === "over" ? overReach + unit(activationW / 2) : 0;
        const leftReach = item.side === "left"
          ? sideReach
          : item.side === "over" && !besideBar ? overReach : 0;
        if (rightReach > 0 && index + 1 < centers.length) {
          widenSpan(index, index + 1, rightReach + noteClearance);
        }
        if (leftReach > 0 && index > 0) {
          widenSpan(index - 1, index, leftReach + noteClearance + nestedBarReach(index - 1));
        }
      }
    }
  };
  reserveColumnWidths(doc.items, 0);

  const participantById = new Map<string, SequenceParticipantLayout>();
  const participants = doc.participants.map((participant, index): SequenceParticipantLayout => {
    const centerX = centers[index] ?? sideGutter;
    const header: SeqRect = {
      x: centerX - headerWidths[index]! / 2,
      y: headerY,
      width: headerWidths[index]!,
      height: unit(SEQUENCE_LAYOUT.HEADER_H),
    };
    const hasStereotype = Boolean(participant.stereotype);
    const layout: SequenceParticipantLayout = {
      id: participant.id,
      name: participant.name,
      label: participant.label,
      stereotype: participant.stereotype,
      kind: participant.kind,
      x: centerX,
      centerX,
      header,
      actor: participant.kind === "actor",
      labelAnchor: {
        x: centerX,
        y: header.y + header.height / 2 + (hasStereotype ? unit(8) : unit(5)),
        anchor: "middle",
      },
      stereotypeAnchor: hasStereotype
        ? { x: centerX, y: header.y + unit(13), anchor: "middle" }
        : undefined,
    };
    participantById.set(participant.id, layout);
    return layout;
  });

  const rows: SequenceLayoutRow[] = [];
  const messages: SequenceMessageLayout[] = [];
  const fragments: SequenceFragmentLayout[] = [];
  const notes: SequenceNoteLayout[] = [];
  const fragmentChildren = new Map<SequenceFragmentLayout, SequenceLayoutRow[]>();
  const rowHeight = unit(rowGap);
  const fragmentPad = unit(fragPad);
  const fragmentTabHeight = unit(SEQUENCE_LAYOUT.FRAG_TAB_H);
  const fragmentMarginY = unit(SEQUENCE_LAYOUT.FRAG_MARGIN_Y);
  const fragmentInnerTop = unit(SEQUENCE_LAYOUT.FRAG_INNER_TOP);
  const fragmentInnerBottom = unit(SEQUENCE_LAYOUT.FRAG_INNER_BOTTOM);
  const fragmentNestedTop = unit(SEQUENCE_LAYOUT.FRAG_NESTED_TOP);
  const fragmentDividerGap = unit(SEQUENCE_LAYOUT.FRAG_DIVIDER_GAP);
  const fragmentGuardHeight = unit(SEQUENCE_LAYOUT.FRAG_GUARD_H);
  const noteMarginY = unit(SEQUENCE_LAYOUT.NOTE_MARGIN_Y);

  const participantX = (id: string): number => participantById.get(id)?.centerX ?? sideGutter;

  // Notes keep the fixed NOTE_W column the side gutters are sized for and
  // grow downward instead: text wraps at the box width minus the label inset
  // on each side, and each line adds one note line height.
  const noteWidth = unit(SEQUENCE_LAYOUT.NOTE_W);
  const noteInset = unit(notePad + 2);
  const noteLineHeight = noteFont.lineHeight ?? noteFont.size;
  const noteHeight = (lineCount: number): number => Math.max(
    unit(24 + notePad * 2),
    lineCount * noteLineHeight + unit(notePad * 2),
  );
  // A message right below a note draws its label above its arrow; at small
  // row gaps that label's ascent and halo would reach into the note box.
  const messageLabelReach = unit(labelGap + LABEL_HALO) + messageFont.size * ASCENT_EM;
  const noteBottomMargin = Math.max(noteMarginY, messageLabelReach - rowHeight / 2);

  const horizontalTextBounds = (
    anchor: SeqTextAnchor,
    width: number,
  ): { left: number; right: number } => {
    if (anchor.anchor === "middle") {
      return { left: anchor.x - width / 2, right: anchor.x + width / 2 };
    }
    if (anchor.anchor === "end") {
      return { left: anchor.x - width, right: anchor.x };
    }
    return { left: anchor.x, right: anchor.x + width };
  };

  const keepTextInsideLeftBound = (
    anchor: SeqTextAnchor,
    text: string,
    font: SeqFont,
  ): void => {
    const bounds = horizontalTextBounds(anchor, safeMeasure(text, font));
    const minimumLeft = unit(margin);
    if (bounds.left < minimumLeft) anchor.x += minimumLeft - bounds.left;
  };

  const makeNote = (note: SequenceNote, top: number, depth: number): {
    row: SequenceNoteLayout;
    endY: number;
  } => {
    const lines = metrics.wrap(note.text, noteFont, noteWidth - noteInset * 2);
    const height = noteHeight(lines.length);
    // The band keeps NOTE_MARGIN_Y of clearance above the box and at least
    // that below it, so notes never collide with adjacent frames or messages;
    // any slack left in a tall row is split evenly.
    const bandHeight = Math.max(rowHeight, height + noteMarginY + noteBottomMargin);
    const y = top + noteMarginY + (bandHeight - noteMarginY - noteBottomMargin) / 2;
    const width = noteWidth;
    const anchorX = participantX(note.anchor);
    let x: number;
    if (note.side === "left") {
      x = anchorX - width - fragmentPad;
    } else if (note.side === "right") {
      x = anchorX + fragmentPad;
    } else {
      x = anchorX - width / 2;
    }
    const box: SeqRect = { x, y: y - height / 2, width, height };
    const fold = unit(10);
    const row: SequenceNoteLayout = {
      kind: "note",
      id: note.id,
      anchorId: note.anchor,
      side: note.side,
      text: note.text,
      lines,
      lineHeight: noteLineHeight,
      y,
      box,
      label: { x: x + noteInset, y: box.y + unit(notePad + 12), anchor: "start" },
      foldPath: [
        { x: box.x + box.width - fold, y: box.y },
        { x: box.x + box.width - fold, y: box.y + fold },
        { x: box.x + box.width, y: box.y + fold },
      ],
      depth,
    };
    return { row, endY: top + bandHeight };
  };

  const makeMessage = (message: SequenceMessage, top: number, depth: number): {
    row: SequenceMessageLayout;
    endY: number;
  } => {
    const self = message.from === message.to;
    const bandHeight = self ? rowHeight * 1.5 : rowHeight;
    const y = top + rowHeight / 2;
    const x1 = participantX(message.from);
    const x2 = participantX(message.to);
    const row: SequenceMessageLayout = {
      kind: "message",
      id: message.id,
      from: message.from,
      to: message.to,
      line: message.line,
      text: message.text,
      y,
      x1,
      y1: y,
      x2,
      y2: y,
      label: {
        x: self ? x1 + unit(SEQUENCE_LAYOUT.SELF_LOOP_W + labelGap) : (x1 + x2) / 2,
        y: y - unit(labelGap),
        anchor: self ? "start" : "middle",
      },
      labelBox: { x: 0, y: 0, width: 0, height: 0 },
      depth,
    };
    if (self) {
      const right = x1 + unit(SEQUENCE_LAYOUT.SELF_LOOP_W);
      row.selfLoop = [
        { x: x1, y },
        { x: right, y },
        { x: right, y: y + rowHeight / 2 },
        { x: x2, y: y + rowHeight / 2 },
      ];
      row.y2 = y + rowHeight / 2;
    }
    keepTextInsideLeftBound(row.label, row.text, messageFont);
    return { row, endY: top + bandHeight };
  };

  const collectParticipantIds = (fragment: SequenceFragment): string[] => {
    const found = new Set<string>();
    const visit = (items: SequenceItem[]): void => {
      for (const item of items) {
        if (item.kind === "message") {
          found.add(item.from);
          found.add(item.to);
        } else if (item.kind === "note") {
          found.add(item.anchor);
        } else {
          for (const operand of item.operands) visit(operand.items);
        }
      }
    };
    for (const operand of fragment.operands) visit(operand.items);
    return doc.participants.filter((participant) => found.has(participant.id)).map(({ id }) => id);
  };

  const xBoundsForRows = (childRows: SequenceLayoutRow[]): { left: number; right: number } | undefined => {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const row of childRows) {
      if (row.kind === "note") {
        left = Math.min(left, row.box.x);
        right = Math.max(right, row.box.x + row.box.width);
      } else if (row.kind === "fragment") {
        left = Math.min(left, row.outer.x);
        right = Math.max(right, row.outer.x + row.outer.width);
      } else {
        const points = row.selfLoop ?? [
          { x: row.x1, y: row.y1 },
          { x: row.x2, y: row.y2 },
        ];
        for (const point of points) {
          left = Math.min(left, point.x);
          right = Math.max(right, point.x);
        }
        const labelBounds = horizontalTextBounds(
          row.label,
          safeMeasure(row.text, messageFont),
        );
        left = Math.min(left, labelBounds.left);
        right = Math.max(right, labelBounds.right);
      }
    }
    return Number.isFinite(left) && Number.isFinite(right) ? { left, right } : undefined;
  };

  const layoutItems = (
    items: SequenceItem[],
    startY: number,
    depth: number,
  ): LayoutScope => {
    const scope: LayoutScope = { startY, endY: startY, events: [] };
    let cursor = startY;
    for (const [itemIndex, item] of items.entries()) {
      if (item.kind === "message") {
        const result = makeMessage(item, cursor, depth);
        rows.push(result.row);
        messages.push(result.row);
        scope.events.push({ type: "message", row: result.row });
        cursor = result.endY;
        continue;
      }
      if (item.kind === "note") {
        const result = makeNote(item, cursor, depth);
        rows.push(result.row);
        notes.push(result.row);
        cursor = result.endY;
        continue;
      }

      // Frames get vertical clearance on both sides so they never touch the
      // preceding/following row's geometry or a sibling frame. Margins
      // collapse: a frame right after a sibling frame reuses that frame's
      // trailing margin, and a frame that opens or closes an operand leans on
      // the parent frame's own inner air instead of stacking a margin on it.
      const nested = depth > 0;
      const afterFrame = itemIndex > 0 && items[itemIndex - 1]!.kind === "fragment";
      const closesOperand = nested && itemIndex === items.length - 1;
      const leadingMargin = afterFrame
        ? 0
        : nested && itemIndex === 0 ? fragmentNestedTop : fragmentMarginY;
      const frameTop = cursor + leadingMargin;
      const participantIds = collectParticipantIds(item);
      const fragmentRow: SequenceFragmentLayout = {
        kind: "fragment",
        id: item.id,
        op: item.op,
        y: frameTop + fragmentTabHeight / 2,
        outer: { x: 0, y: frameTop, width: 0, height: 0 },
        tab: { x: 0, y: frameTop, width: 0, height: fragmentTabHeight },
        tabPath: [],
        dividerYs: [],
        guardLabels: [],
        participantIds,
        depth,
      };
      rows.push(fragmentRow);
      fragments.push(fragmentRow);
      const firstChildRow = rows.length;
      cursor = frameTop + fragmentTabHeight + fragmentInnerTop;
      const operandScopes: LayoutScope[] = [];
      const operandStarts: number[] = [];
      const hasGuardRow = (operandIndex: number): boolean => {
        const operand = item.operands[operandIndex]!;
        return Boolean(operand.guard) || (item.op === "alt" && operandIndex > 0);
      };
      for (let operandIndex = 0; operandIndex < item.operands.length; operandIndex += 1) {
        if (operandIndex > 0) {
          // Dashed dividers get breathing room on both sides so operand
          // contents never crowd them.
          cursor += fragmentDividerGap;
          fragmentRow.dividerYs.push(cursor);
          cursor += fragmentDividerGap;
        }
        operandStarts.push(cursor);
        // Guard labels below a divider occupy their own band before items.
        if (operandIndex > 0 && hasGuardRow(operandIndex)) cursor += fragmentGuardHeight;
        const operand = item.operands[operandIndex]!;
        const operandScope = layoutItems(operand.items, cursor, depth + 1);
        if (operandScope.endY === cursor) operandScope.endY += rowHeight;
        operandScopes.push(operandScope);
        cursor = operandScope.endY;
      }
      cursor += fragmentInnerBottom;
      const childRows = rows.slice(firstChildRow);
      fragmentChildren.set(fragmentRow, childRows);
      const childBounds = xBoundsForRows(childRows);
      const involvedXs = participantIds.map(participantX);
      const fallbackCenter = participants.length > 0
        ? (participants[0]!.centerX + participants[participants.length - 1]!.centerX) / 2
        : sideGutter;
      const involvedLeft = involvedXs.length > 0
        ? Math.min(...participantIds.map(id => participantById.get(id)!.header.x))
        : fallbackCenter;
      const involvedRight = involvedXs.length > 0
        ? Math.max(...participantIds.map(id => {
            const header = participantById.get(id)!.header;
            return header.x + header.width;
          }))
        : fallbackCenter;
      const tabWidth = safeMeasure(item.op, fragmentOpFont) + unit(30);
      const outerLeft = Math.min(involvedLeft, childBounds?.left ?? involvedLeft) - fragmentPad;
      let outerRight = Math.max(involvedRight, childBounds?.right ?? involvedRight) + fragmentPad;
      outerRight = Math.max(outerRight, outerLeft + tabWidth + fragmentPad);
      fragmentRow.outer = {
        x: outerLeft,
        y: frameTop,
        width: outerRight - outerLeft,
        height: cursor - frameTop,
      };
      fragmentRow.tab = {
        x: outerLeft,
        y: frameTop,
        width: tabWidth,
        height: fragmentTabHeight,
      };
      const dogEar = Math.min(fragmentTabHeight * 0.7, tabWidth / 3);
      fragmentRow.tabPath = [
        { x: outerLeft, y: frameTop },
        { x: outerLeft + tabWidth, y: frameTop },
        { x: outerLeft + tabWidth - dogEar, y: frameTop + fragmentTabHeight },
        { x: outerLeft, y: frameTop + fragmentTabHeight },
        { x: outerLeft, y: frameTop },
      ];
      fragmentRow.guardLabels = item.operands.map((operand, operandIndex) => {
        const label = operand.guard
          ? `[${operand.guard}]`
          : item.op === "alt" && operandIndex > 0
            ? "[else]"
            : "";
        return {
          operand: operandIndex,
          guard: operand.guard,
          label,
          anchor: {
            x: operandIndex === 0 ? outerLeft + tabWidth + unit(6) : outerLeft + fragmentPad,
            y: operandIndex === 0
              ? frameTop + fragmentTabHeight * 0.72
              : operandStarts[operandIndex]! + unit(14),
            anchor: "start",
          },
          box: { x: 0, y: 0, width: 0, height: 0 },
        };
      });
      for (const guard of fragmentRow.guardLabels) {
        if (!guard.label) continue;
        const guardBounds = horizontalTextBounds(
          guard.anchor,
          safeMeasure(guard.label, guardFont),
        );
        outerRight = Math.max(outerRight, guardBounds.right + fragmentPad);
      }
      fragmentRow.outer.width = outerRight - outerLeft;
      // Trailing clearance below the frame before the next row begins.
      if (!closesOperand) cursor += fragmentMarginY;
      scope.events.push({
        type: "fragment",
        frame: fragmentRow,
        operands: operandScopes,
        operandTops: operandStarts,
      });
    }
    scope.endY = cursor;
    return scope;
  };

  const sequenceTop = headerY + unit(SEQUENCE_LAYOUT.HEADER_H) + rowHeight / 2;
  const documentScope = layoutItems(doc.items, sequenceTop, 0);
  if (documentScope.endY === sequenceTop) documentScope.endY += rowHeight;
  const contentEnd = documentScope.endY;

  const bars: MutableActivation[] = [];
  const activationWidth = unit(activationW);
  const activationOffset = activationWidth / 3;
  /** Air between a bar that stops for a frame and the frame's top edge. */
  const barFrameGap = unit(SEQUENCE_LAYOUT.GRID / 2);
  /** Ids of sync calls that the previous walk found no return for. */
  let unmatchedCalls: ReadonlySet<string> = new Set();

  const isOpen = (activation: MutableActivation, closedHere: Set<MutableActivation>): boolean =>
    activation.rect.height < 0 && !closedHere.has(activation);

  const activeFor = (
    participantId: string,
    inherited: MutableActivation[],
    local: MutableActivation[],
    closedHere: Set<MutableActivation>,
  ): MutableActivation | undefined => {
    const active = [...inherited, ...local].filter(
      (activation) => activation.participantId === participantId && isOpen(activation, closedHere),
    );
    return active[active.length - 1];
  };

  const dockX = (
    participantId: string,
    towardX: number,
    inherited: MutableActivation[],
    local: MutableActivation[],
    closedHere: Set<MutableActivation>,
  ): number => {
    const activation = activeFor(participantId, inherited, local, closedHere);
    const center = participantX(participantId);
    if (!activation) return center;
    return towardX >= center
      ? activation.rect.x + activation.rect.width
      : activation.rect.x;
  };

  const setMessageGeometry = (
    row: SequenceMessageLayout,
    inherited: MutableActivation[],
    local: MutableActivation[],
    closedHere: Set<MutableActivation>,
  ): void => {
    const fromCenter = participantX(row.from);
    const toCenter = participantX(row.to);
    if (row.from === row.to) {
      const active = activeFor(row.from, inherited, local, closedHere);
      const edge = active ? active.rect.x + active.rect.width : fromCenter;
      const right = Math.max(edge, fromCenter) + unit(SEQUENCE_LAYOUT.SELF_LOOP_W);
      const targetActive = activeFor(row.to, inherited, local, closedHere);
      const targetEdge = targetActive ? targetActive.rect.x + targetActive.rect.width : toCenter;
      row.x1 = edge;
      row.y1 = row.y;
      row.x2 = targetEdge;
      row.y2 = row.y + rowHeight / 2;
      row.selfLoop = [
        { x: edge, y: row.y },
        { x: right, y: row.y },
        { x: right, y: row.y2 },
        { x: targetEdge, y: row.y2 },
      ];
      row.label = { x: right + unit(labelGap), y: row.y + unit(14), anchor: "start" };
      return;
    }
    row.x1 = dockX(row.from, toCenter, inherited, local, closedHere);
    row.y1 = row.y;
    row.x2 = dockX(row.to, fromCenter, inherited, local, closedHere);
    row.y2 = row.y;
    row.selfLoop = undefined;
    row.label = { x: (row.x1 + row.x2) / 2, y: row.y - unit(labelGap), anchor: "middle" };
  };

  const closeActivation = (
    activation: MutableActivation,
    endY: number,
    endMessageId?: string,
  ): void => {
    activation.rect.height = Math.max(unit(1), endY - activation.rect.y);
    activation.endMessageId = endMessageId;
  };

  /** Bottom of a message's own row band. */
  const rowBandEnd = (row: SequenceMessageLayout): number =>
    row.y + (row.from === row.to ? rowHeight : rowHeight / 2);

  /**
   * In an operand that does not return a bar opened above its frame, the bar
   * shows only over the operand's first rows that its lifeline takes part
   * in. Undefined when the operand does not open with such a row.
   */
  const involvedRowsEnd = (operand: LayoutScope, participantId: string): number | undefined => {
    let end: number | undefined;
    for (const event of operand.events) {
      if (event.type === "fragment") break;
      if (event.row.from !== participantId && event.row.to !== participantId) break;
      end = rowBandEnd(event.row);
    }
    return end === undefined ? undefined : Math.min(end, operand.endY);
  };

  const walkScope = (
    scope: LayoutScope,
    inherited: MutableActivation[],
  ): Map<MutableActivation, ActivationClosure> => {
    const local: MutableActivation[] = [];
    const inheritedClosures = new Map<MutableActivation, ActivationClosure>();
    const closedHere = new Set<MutableActivation>();
    // A bar for a call with no return covers its own row and the rows right
    // after it that its lifeline takes part in. It ends at the first row
    // without that lifeline, at a frame, or at the end of its scope.
    const closeShortBars = (keep: (activation: MutableActivation) => boolean): void => {
      for (const activation of local) {
        if (activation.shortEnd === undefined || !isOpen(activation, closedHere) || keep(activation)) continue;
        closeActivation(activation, Math.min(activation.shortEnd, scope.endY));
      }
    };
    for (const event of scope.events) {
      if (event.type === "fragment") {
        closeShortBars(() => false);
        // Each operand starts from the same activation state. Its returns are
        // branch-local until they are merged here, which prevents one sibling
        // from changing the state observed by another sibling.
        const visible = [...inherited, ...local].filter((activation) => isOpen(activation, closedHere));
        const perOperand = event.operands.map((operand) => walkScope(operand, visible));
        const mergedClosures = new Map<MutableActivation, ActivationClosure>();
        for (const closures of perOperand) {
          for (const [activation, closure] of closures) {
            const previous = mergedClosures.get(activation);
            if (!previous || closure.endY > previous.endY) {
              mergedClosures.set(activation, closure);
            }
          }
        }
        const frameTop = event.frame.outer.y;
        for (const [activation, closure] of mergedClosures) {
          // The bar ends inside this frame: it stops above the frame and
          // shows in each operand until that operand's return.
          activation.cuts.push({
            top: frameTop,
            bottom: frameTop + event.frame.outer.height,
            pieces: event.operands.map((operand, index) => ({
              top: event.operandTops[index]!,
              bottom: perOperand[index]!.get(activation)?.endY
                ?? involvedRowsEnd(operand, activation.participantId)
                ?? event.operandTops[index]!,
            })),
          });
          if (local.includes(activation)) {
            closeActivation(activation, closure.endY, closure.endMessageId);
          } else {
            inheritedClosures.set(activation, closure);
          }
          closedHere.add(activation);
        }
        continue;
      }
      const row = event.row;
      // A new sync call from the same caller means the earlier call is over.
      closeShortBars((activation) => (activation.participantId === row.from || activation.participantId === row.to)
        && !(row.line === "sync" && activation.participantId === row.to && activation.callerId === row.from));
      for (const activation of local) {
        if (activation.shortEnd !== undefined && isOpen(activation, closedHere)) {
          activation.shortEnd = Math.max(activation.shortEnd, rowBandEnd(row));
        }
      }
      if (row.line === "sync") {
        // The caller docks before receipt; the callee docks on the bar beginning
        // at this row, which matches UML activation-bar arrow docking.
        const sourceX = dockX(
          row.from,
          participantX(row.to),
          inherited,
          local,
          closedHere,
        );
        const unmatched = unmatchedCalls.has(row.id);
        // A call with no return onto a lifeline that is already active adds
        // no bar: the open bar covers it. Self-calls still nest.
        const covering = unmatched && row.from !== row.to
          ? activeFor(row.to, inherited, local, closedHere)
          : undefined;
        if (!covering) {
          const level = [...inherited, ...local].filter(
            (activation) => activation.participantId === row.to && isOpen(activation, closedHere),
          ).length;
          const center = participantX(row.to) + level * activationOffset;
          const activation: MutableActivation = {
            participantId: row.to,
            callerId: row.from,
            level,
            rect: {
              x: center - activationWidth / 2,
              y: row.y,
              width: activationWidth,
              height: -1,
            },
            startMessageId: row.id,
            shortEnd: unmatched ? rowBandEnd(row) : undefined,
            cuts: [],
          };
          local.push(activation);
          bars.push(activation);
        }
        setMessageGeometry(row, inherited, local, closedHere);
        row.x1 = sourceX;
        if (row.selfLoop) row.selfLoop[0] = { x: sourceX, y: row.y1 };
      } else if (row.line === "return") {
        setMessageGeometry(row, inherited, local, closedHere);
        const candidates = [...inherited, ...local];
        let match: MutableActivation | undefined;
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
          const activation = candidates[index]!;
          if (
            isOpen(activation, closedHere)
            && activation.participantId === row.from
            && activation.callerId === row.to
          ) {
            match = activation;
            break;
          }
        }
        if (match) {
          if (local.includes(match)) {
            closeActivation(match, row.y, row.id);
          } else {
            inheritedClosures.set(match, { endY: row.y, endMessageId: row.id });
          }
          closedHere.add(match);
        }
      } else {
        setMessageGeometry(row, inherited, local, closedHere);
      }
    }
    closeShortBars(() => false);
    for (const activation of local) {
      if (activation.rect.height < 0) closeActivation(activation, scope.endY);
    }
    return inheritedClosures;
  };
  // The first walk finds the calls with no return; the second draws their
  // bars short, so they neither run to the end of their scope nor stack.
  walkScope(documentScope, []);
  unmatchedCalls = new Set(bars.filter((bar) => bar.endMessageId === undefined).map((bar) => bar.startMessageId));
  bars.length = 0;
  walkScope(documentScope, []);

  // One rect per visible piece of each bar: a bar that ends inside a frame
  // stops above the frame and continues inside each operand.
  const activations: SequenceActivationLayout[] = [];
  for (const bar of bars) {
    let segments = [{ top: bar.rect.y, bottom: bar.rect.y + bar.rect.height }];
    const cuts = [...bar.cuts].sort((a, b) => a.top - b.top || (b.bottom - b.top) - (a.bottom - a.top));
    for (const cut of cuts) {
      const next: { top: number; bottom: number }[] = [];
      let entered = false;
      for (const segment of segments) {
        if (segment.bottom <= cut.top || segment.top >= cut.bottom) {
          next.push(segment);
          continue;
        }
        entered = true;
        const above = Math.min(segment.bottom, cut.top - barFrameGap);
        if (above > segment.top) next.push({ top: segment.top, bottom: above });
      }
      if (entered) {
        for (const piece of cut.pieces) {
          if (piece.bottom > piece.top) next.push(piece);
        }
      }
      segments = next.sort((a, b) => a.top - b.top);
    }
    for (const segment of segments) {
      activations.push({
        participantId: bar.participantId,
        level: bar.level,
        rect: { x: bar.rect.x, y: segment.top, width: bar.rect.width, height: segment.bottom - segment.top },
        startMessageId: bar.startMessageId,
        endMessageId: bar.endMessageId,
      });
    }
  }

  // A label centered on a long arrow sits on the lifelines and bars the
  // arrow passes. When one stretch of the arrow between those obstacles
  // holds the whole label, the label moves there, nearest the sender first.
  const labelClearance = unit(LABEL_BOX_PAD.x + SEQUENCE_LAYOUT.GRID / 2);
  for (const message of messages) {
    if (message.selfLoop) continue;
    const left = Math.min(message.x1, message.x2);
    const right = Math.max(message.x1, message.x2);
    const top = message.label.y - messageFont.size * ASCENT_EM;
    const bottom = message.label.y + messageFont.size * DESCENT_EM;
    const obstacles: { left: number; right: number }[] = [];
    for (const participant of participants) {
      if (participant.id === message.from || participant.id === message.to) continue;
      if (participant.centerX <= left || participant.centerX >= right) continue;
      const obstacle = { left: participant.centerX - unit(0.5), right: participant.centerX + unit(0.5) };
      for (const activation of activations) {
        if (activation.participantId !== participant.id) continue;
        if (activation.rect.y > bottom || activation.rect.y + activation.rect.height < top) continue;
        obstacle.left = Math.min(obstacle.left, activation.rect.x);
        obstacle.right = Math.max(obstacle.right, activation.rect.x + activation.rect.width);
      }
      obstacles.push(obstacle);
    }
    if (obstacles.length === 0) continue;
    const textWidth = safeMeasure(message.text, messageFont);
    const centered = horizontalTextBounds(message.label, textWidth);
    const clear = obstacles.every((obstacle) =>
      obstacle.right + labelClearance <= centered.left || obstacle.left - labelClearance >= centered.right);
    if (clear) continue;
    obstacles.sort((a, b) => a.left - b.left);
    const slots: { left: number; right: number }[] = [];
    let slotLeft = left;
    for (const obstacle of obstacles) {
      slots.push({ left: slotLeft, right: obstacle.left });
      slotLeft = obstacle.right;
    }
    slots.push({ left: slotLeft, right });
    if (message.x1 > message.x2) slots.reverse();
    const slot = slots.find((candidate) => candidate.right - candidate.left - labelClearance * 2 >= textWidth);
    if (slot) message.label.x = (slot.left + slot.right) / 2;
  }

  // Activation docking recalculates message anchors, so enforce the left
  // diagram inset after the activation pass as well as during initial layout.
  for (const message of messages) {
    keepTextInsideLeftBound(message.label, message.text, messageFont);
  }

  // An "over" note stays centered on its lifeline. When an activation bar
  // of that lifeline runs through the box, the note moves beside the bar,
  // its left edge NOTE_BAR_GAP right of the bar, so the bar stays whole.
  const notesOnBars = new Set<string>();
  for (const note of notes) {
    if (note.side !== "over") continue;
    const bars = activations.filter((activation) =>
      activation.participantId === note.anchorId
      && activation.rect.y < note.box.y + note.box.height
      && activation.rect.y + activation.rect.height > note.box.y);
    if (bars.length === 0) continue;
    notesOnBars.add(note.id);
    const barRight = Math.max(...bars.map(({ rect }) => rect.x + rect.width));
    const offset = barRight + unit(NOTE_BAR_GAP) - note.box.x;
    note.box.x += offset;
    note.label.x += offset;
    note.foldPath = note.foldPath.map((point) => ({ ...point, x: point.x + offset }));
  }

  // Activation docking can move message endpoints a few pixels beyond their
  // lifeline centers. Expand frames inside-out after that pass so every frame
  // encloses descendant geometry and the full edges of overlapping activation
  // bars for every participant column involved in the fragment.
  for (let index = fragments.length - 1; index >= 0; index -= 1) {
    const fragment = fragments[index]!;
    const childBounds = xBoundsForRows(fragmentChildren.get(fragment) ?? []);
    const involved = new Set(fragment.participantIds);
    const involvedXs = fragment.participantIds.map(participantX);
    let contentLeft = involvedXs.length > 0
      ? Math.min(...involvedXs)
      : Number.POSITIVE_INFINITY;
    let contentRight = involvedXs.length > 0
      ? Math.max(...involvedXs)
      : Number.NEGATIVE_INFINITY;
    if (childBounds) {
      contentLeft = Math.min(contentLeft, childBounds.left);
      contentRight = Math.max(contentRight, childBounds.right);
    }
    const fragmentBottom = fragment.outer.y + fragment.outer.height;
    for (const activation of activations) {
      if (!involved.has(activation.participantId)) continue;
      const activationBottom = activation.rect.y + activation.rect.height;
      if (activation.rect.y > fragmentBottom || activationBottom < fragment.outer.y) continue;
      contentLeft = Math.min(contentLeft, activation.rect.x);
      contentRight = Math.max(contentRight, activation.rect.x + activation.rect.width);
    }
    if (!Number.isFinite(contentLeft) || !Number.isFinite(contentRight)) continue;
    const previousLeft = fragment.outer.x;
    const previousRight = fragment.outer.x + fragment.outer.width;
    const nextLeft = Math.min(previousLeft, contentLeft - fragmentPad);
    const nextRight = Math.max(previousRight, contentRight + fragmentPad);
    if (nextLeft !== previousLeft) {
      const delta = nextLeft - previousLeft;
      fragment.tab.x += delta;
      fragment.tabPath = fragment.tabPath.map((point) => ({ x: point.x + delta, y: point.y }));
      fragment.guardLabels = fragment.guardLabels.map((guard) => ({
        ...guard,
        anchor: { ...guard.anchor, x: guard.anchor.x + delta },
      }));
    }
    fragment.outer.x = nextLeft;
    fragment.outer.width = nextRight - nextLeft;
  }

  // A guard that an activation bar runs through moves right, past the bar,
  // while it still fits inside its frame; lifelines stop at its box.
  const guardClearance = unit(LABEL_BOX_PAD.x + SEQUENCE_LAYOUT.GRID / 2);
  for (const fragment of fragments) {
    const frameRight = fragment.outer.x + fragment.outer.width - fragmentPad;
    for (const guard of fragment.guardLabels) {
      if (!guard.label) continue;
      const width = safeMeasure(guard.label, guardFont);
      const top = guard.anchor.y - guardFont.size * ASCENT_EM;
      const bottom = guard.anchor.y + guardFont.size * DESCENT_EM;
      let x = guard.anchor.x;
      for (let step = 0; step < activations.length; step += 1) {
        const hit = activations.filter(({ rect }) =>
          rect.y < bottom && rect.y + rect.height > top
          && rect.x < x + width + guardClearance && rect.x + rect.width + guardClearance > x);
        if (hit.length === 0) break;
        x = Math.max(...hit.map(({ rect }) => rect.x + rect.width)) + guardClearance;
      }
      if (x + width <= frameRight) guard.anchor.x = x;
    }
  }

  // Label boxes, from the final anchors: the renderer paints each one with
  // the background behind its text, so lifelines, bars and dividers stop at
  // the box edge instead of cutting through the glyphs.
  const labelBox = (
    anchor: SeqTextAnchor,
    text: string,
    font: SeqFont,
    limits: { minTop?: number; bottom?: number } = {},
  ): SeqRect => {
    if (singleLineText(text) === "") return { x: anchor.x, y: anchor.y, width: 0, height: 0 };
    const { left, right } = horizontalTextBounds(anchor, safeMeasure(text, font));
    const padX = unit(LABEL_BOX_PAD.x);
    const padY = unit(LABEL_BOX_PAD.y);
    const glyphTop = anchor.y - font.size * ASCENT_EM;
    const glyphBottom = anchor.y + font.size * DESCENT_EM;
    const top = Math.min(glyphTop, Math.max(glyphTop - padY, limits.minTop ?? Number.NEGATIVE_INFINITY));
    const bottom = Math.max(glyphBottom, limits.bottom ?? glyphBottom + padY);
    return {
      x: left - padX,
      y: top,
      width: right - left + padX * 2,
      height: bottom - top,
    };
  };
  // Half the arrow's stroke: a label box stops at the arrow's top edge.
  const arrowHalfStroke = unit(0.75);
  for (const message of messages) {
    message.labelBox = labelBox(message.label, message.text, messageFont, {
      bottom: message.selfLoop ? undefined : message.y - arrowHalfStroke,
    });
  }
  // A guard box never covers its frame's top edge or the divider above it.
  const frameStroke = unit(1);
  for (const fragment of fragments) {
    for (const guard of fragment.guardLabels) {
      const edge = guard.operand === 0 ? fragment.outer.y : fragment.dividerYs[guard.operand - 1]!;
      guard.box = labelBox(guard.anchor, guard.label, guardFont, { minTop: edge + frameStroke });
    }
  }

  let rightEdge = participants.reduce(
    (right, participant) => Math.max(right, participant.header.x + participant.header.width),
    sideGutter,
  );
  for (const note of notes) rightEdge = Math.max(rightEdge, note.box.x + note.box.width);
  for (const fragment of fragments) rightEdge = Math.max(rightEdge, fragment.outer.x + fragment.outer.width);
  for (const message of messages) {
    for (const point of message.selfLoop ?? []) rightEdge = Math.max(rightEdge, point.x);
    rightEdge = Math.max(rightEdge, message.x1, message.x2);
    const labelBounds = horizontalTextBounds(
      message.label,
      safeMeasure(message.text, messageFont),
    );
    rightEdge = Math.max(rightEdge, labelBounds.right);
  }
  for (const activation of activations) {
    rightEdge = Math.max(rightEdge, activation.rect.x + activation.rect.width);
  }
  const width = rightEdge + sideGutter;
  const footerY = contentEnd + unit(SEQUENCE_LAYOUT.FOOTER_GAP);
  const participantFooters = participants.map((participant): SequenceParticipantLayout => {
    const offset = footerY - participant.header.y;
    return {
      ...participant,
      header: { ...participant.header, y: footerY },
      labelAnchor: { ...participant.labelAnchor, y: participant.labelAnchor.y + offset },
      stereotypeAnchor: participant.stereotypeAnchor
        ? { ...participant.stereotypeAnchor, y: participant.stereotypeAnchor.y + offset }
        : undefined,
    };
  });
  const height = footerY + unit(SEQUENCE_LAYOUT.HEADER_H + margin);
  const lifelineY1 = headerY + unit(SEQUENCE_LAYOUT.HEADER_H);
  const lifelineY2 = footerY;
  const lifelines: SequenceLifelineSegment[] = participants.map((participant) => ({
    participantId: participant.id,
    x: participant.centerX,
    y1: lifelineY1,
    y2: lifelineY2,
  }));

  // Feedback for a later pass (see layoutSequence).
  const deepestLevels = new Map<string, number>();
  for (const { participantId, level } of activations) {
    if (level > (deepestLevels.get(participantId) ?? 0)) deepestLevels.set(participantId, level);
  }
  const excessByMessage = new Map<string, number>();
  for (const message of messages) {
    if (message.selfLoop) continue;
    const fromX = participantX(message.from);
    const toX = participantX(message.to);
    const [leftX, leftCenter, rightX, rightCenter] = fromX <= toX
      ? [message.x1, fromX, message.x2, toX]
      : [message.x2, toX, message.x1, fromX];
    const excess = Math.max(0, leftX - leftCenter - activationWidth / 2)
      + Math.max(0, rightCenter - rightX - activationWidth / 2);
    if (excess > 0) excessByMessage.set(message.id, Math.max(excess, excessByMessage.get(message.id) ?? 0));
  }

  const layout: SequenceLayout = {
    width,
    height,
    scale,
    title: doc.title
      ? {
          text: doc.title,
          anchor: {
            x: unit(margin),
            y: unit(margin + TITLE_BASELINE),
            anchor: "start",
          },
          // Wrap rather than widen: a long title must not shrink the whole
          // diagram when a host scales it to fit a column.
          lines: metrics.wrap(doc.title, titleFont, width - unit(margin) * 2),
          lineHeight: titleLineHeight,
        }
      : undefined,
    participants,
    participantFooters,
    lifelines,
    rows,
    messages,
    fragments,
    notes,
    activations,
  };
  return { layout, activationDepth: deepestLevels, dockingExcess: excessByMessage, notesBesideBars: notesOnBars };
}
