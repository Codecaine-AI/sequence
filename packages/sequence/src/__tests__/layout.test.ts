import { describe, expect, test } from "bun:test";

import {
  SEQUENCE_LAYOUT,
  layoutSequence,
  type SeqPoint,
  type SeqRect,
  type SeqTextAnchor,
  type SequenceLayoutRow,
} from "../layout";
import type { SequenceDocument, SequenceItem } from "../schema";

const participants: SequenceDocument["participants"] = [
  { id: "p1", name: "caller", kind: "actor" },
  { id: "p2", name: "service", kind: "participant" },
  { id: "p3", name: "store", kind: "participant" },
];

function documentWith(items: SequenceItem[], style: SequenceDocument["style"] = {}): SequenceDocument {
  return {
    version: 1,
    id: "layout-test",
    participants,
    items,
    style,
  };
}

function pointInside(rect: SeqRect, point: SeqPoint): boolean {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function horizontalTextBounds(anchor: SeqTextAnchor, width: number): {
  left: number;
  right: number;
} {
  if (anchor.anchor === "middle") {
    return { left: anchor.x - width / 2, right: anchor.x + width / 2 };
  }
  if (anchor.anchor === "end") {
    return { left: anchor.x - width, right: anchor.x };
  }
  return { left: anchor.x, right: anchor.x + width };
}

function rowGeometryInside(frame: SeqRect, row: SequenceLayoutRow): boolean {
  if (row.kind === "note") {
    return pointInside(frame, { x: row.box.x, y: row.box.y })
      && pointInside(frame, {
        x: row.box.x + row.box.width,
        y: row.box.y + row.box.height,
      });
  }
  if (row.kind === "fragment") {
    return pointInside(frame, { x: row.outer.x, y: row.outer.y })
      && pointInside(frame, {
        x: row.outer.x + row.outer.width,
        y: row.outer.y + row.outer.height,
      });
  }
  const points = row.selfLoop ?? [
    { x: row.x1, y: row.y1 },
    { x: row.x2, y: row.y2 },
  ];
  return points.every((point) => pointInside(frame, point));
}

describe("layoutSequence", () => {
  test("uses the pinned base constants and assigns strictly increasing item rows", () => {
    expect(SEQUENCE_LAYOUT).toEqual({
      GRID: 8,
      COLUMN_GAP: 140,
      HEADER_H: 40,
      HEADER_PAD_X: 16,
      ROW_H: 36,
      ACTIVATION_W: 12,
      FRAG_PAD: 12,
      FRAG_TAB_H: 20,
      NOTE_W: 160,
      MARGIN: 24,
      SELF_LOOP_W: 40,
    });

    const layout = layoutSequence(documentWith([
      { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "begin" },
      {
        kind: "fragment",
        id: "f1",
        op: "alt",
        operands: [
          {
            guard: "cached",
            items: [
              { kind: "note", id: "n1", anchor: "p2", side: "over", text: "fast" },
            ],
          },
          {
            items: [
              { kind: "message", id: "m2", from: "p2", to: "p3", line: "async", text: "load" },
            ],
          },
        ],
      },
      { kind: "message", id: "m3", from: "p2", to: "p1", line: "return", text: "done" },
    ]));

    expect(layout.rows.length).toBe(5);
    for (let index = 1; index < layout.rows.length; index += 1) {
      expect(layout.rows[index]!.y).toBeGreaterThan(layout.rows[index - 1]!.y);
    }
  });

  test("fragment frames contain nested item geometry and expose dividers and tabs", () => {
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "outer",
        op: "loop",
        operands: [
          {
            guard: "each",
            items: [
              {
                kind: "fragment",
                id: "inner",
                op: "alt",
                operands: [
                  {
                    guard: "yes",
                    items: [
                      { kind: "message", id: "m1", from: "p1", to: "p3", line: "sync", text: "dispatch" },
                    ],
                  },
                  {
                    items: [
                      { kind: "note", id: "n1", anchor: "p3", side: "right", text: "fallback" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]));
    const outer = layout.fragments.find(({ id }) => id === "outer")!;
    const inner = layout.fragments.find(({ id }) => id === "inner")!;
    const descendants = layout.rows.filter((row) => row.id !== outer.id);

    expect(outer.tabPath).toHaveLength(5);
    expect(inner.dividerYs).toHaveLength(1);
    expect(inner.guardLabels.map(({ label }) => label)).toEqual(["[yes]", "[else]"]);
    expect(descendants.every((row) => rowGeometryInside(outer.outer, row))).toBe(true);
    expect(rowGeometryInside(outer.outer, inner)).toBe(true);
  });

  test("fragment frames span every involved column and contain their message labels", () => {
    const widths = new Map([
      ["left branch label", 190],
      ["right branch label", 210],
    ]);
    const measure = (text: string): number => widths.get(text) ?? text.length * 7;
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "f1",
        op: "alt",
        operands: [
          {
            guard: "right",
            items: [
              { kind: "message", id: "m1", from: "p2", to: "p3", line: "async", text: "right branch label" },
            ],
          },
          {
            items: [
              { kind: "message", id: "m2", from: "p2", to: "p1", line: "return", text: "left branch label" },
            ],
          },
        ],
      },
    ]), measure);
    const fragment = layout.fragments[0]!;
    const frameLeft = fragment.outer.x;
    const frameRight = frameLeft + fragment.outer.width;
    const participantXs = layout.participants.map(({ centerX }) => centerX);

    expect(fragment.participantIds).toEqual(["p1", "p2", "p3"]);
    expect(frameLeft).toBeLessThanOrEqual(
      Math.min(...participantXs) - SEQUENCE_LAYOUT.FRAG_PAD,
    );
    expect(frameRight).toBeGreaterThanOrEqual(
      Math.max(...participantXs) + SEQUENCE_LAYOUT.FRAG_PAD,
    );
    for (const message of layout.messages) {
      const bounds = horizontalTextBounds(message.label, measure(message.text));
      expect(bounds.left).toBeGreaterThanOrEqual(frameLeft);
      expect(bounds.right).toBeLessThanOrEqual(frameRight);
    }
  });

  test("measures bracketed guard labels after the operator tab", () => {
    const guardText = "[needs confirmation]";
    const guardWidth = 260;
    const measured: string[] = [];
    const measure = (text: string): number => {
      measured.push(text);
      return text === guardText ? guardWidth : text.length * 7;
    };
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "f1",
        op: "opt",
        operands: [
          {
            guard: "needs confirmation",
            items: [
              { kind: "message", id: "m1", from: "p2", to: "p3", line: "async", text: "confirm" },
            ],
          },
        ],
      },
    ]), measure);
    const fragment = layout.fragments[0]!;
    const guard = fragment.guardLabels[0]!;
    const frameRight = fragment.outer.x + fragment.outer.width;

    expect(measured).toContain(guardText);
    expect(guard.anchor.x).toBeGreaterThanOrEqual(fragment.tab.x + fragment.tab.width);
    expect(guard.anchor.x + guardWidth + SEQUENCE_LAYOUT.FRAG_PAD).toBeLessThanOrEqual(
      frameRight,
    );
  });

  test("keeps very wide message labels inside the final diagram bounds", () => {
    const labelWidth = 800;
    const layout = layoutSequence(documentWith([
      {
        kind: "message",
        id: "m1",
        from: "p1",
        to: "p2",
        line: "async",
        text: "a deliberately very wide message label",
      },
    ]), (text) => text.startsWith("a deliberately") ? labelWidth : text.length * 7);
    const bounds = horizontalTextBounds(layout.messages[0]!.label, labelWidth);

    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(layout.width);
  });

  test("docks incoming arrows on the edge of a newly active target bar", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "call" },
      { kind: "message", id: "m2", from: "p1", to: "p2", line: "async", text: "signal" },
      { kind: "message", id: "m3", from: "p2", to: "p1", line: "return", text: "done" },
    ]));
    const activation = layout.activations[0]!;
    const call = layout.messages[0]!;
    const signal = layout.messages[1]!;

    expect(call.x2).toBe(activation.rect.x);
    expect(signal.x2).toBe(activation.rect.x);
    expect(call.x2).not.toBe(layout.participants[1]!.centerX);
    expect(activation.endMessageId).toBe("m3");
    expect(activation.rect.height).toBe(layout.messages[2]!.y - call.y);
  });

  test("stacks nested activations and does not close one for an unmatched return", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "outer" },
      { kind: "message", id: "m2", from: "p1", to: "p2", line: "sync", text: "inner" },
      { kind: "message", id: "m3", from: "p2", to: "p3", line: "return", text: "not a match" },
      { kind: "message", id: "m4", from: "p2", to: "p1", line: "return", text: "inner done" },
      { kind: "message", id: "m5", from: "p2", to: "p1", line: "return", text: "outer done" },
    ]));

    expect(layout.activations.map(({ level }) => level)).toEqual([0, 1]);
    expect(layout.activations[1]!.rect.x).toBeGreaterThan(layout.activations[0]!.rect.x);
    expect(layout.activations[1]!.endMessageId).toBe("m4");
    expect(layout.activations[0]!.endMessageId).toBe("m5");
  });

  test("closes an outer activation from a return inside a nested fragment operand", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "begin" },
      {
        kind: "fragment",
        id: "outer-alt",
        op: "alt",
        operands: [
          {
            guard: "success",
            items: [
              {
                kind: "fragment",
                id: "nested-opt",
                op: "opt",
                operands: [{
                  guard: "ready",
                  items: [
                    { kind: "message", id: "nested-return", from: "p2", to: "p1", line: "return", text: "done" },
                  ],
                }],
              },
            ],
          },
          {
            items: [
              { kind: "message", id: "other-branch", from: "p1", to: "p3", line: "async", text: "fallback" },
            ],
          },
        ],
      },
    ]));
    const activation = layout.activations.find(({ startMessageId }) => startMessageId === "call")!;
    const nestedReturn = layout.messages.find(({ id }) => id === "nested-return")!;

    expect(activation.endMessageId).toBe(nestedReturn.id);
    expect(activation.rect.y + activation.rect.height).toBe(nestedReturn.y);
  });

  test("does not let a return in one operand close an activation opened in a sibling operand", () => {
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "branches",
        op: "alt",
        operands: [
          {
            guard: "call",
            items: [
              { kind: "message", id: "branch-call", from: "p1", to: "p2", line: "sync", text: "begin" },
            ],
          },
          {
            items: [
              { kind: "message", id: "sibling-return", from: "p2", to: "p1", line: "return", text: "done" },
            ],
          },
        ],
      },
    ]));
    const fragment = layout.fragments.find(({ id }) => id === "branches")!;
    const activation = layout.activations.find(({ startMessageId }) => startMessageId === "branch-call")!;
    const siblingReturn = layout.messages.find(({ id }) => id === "sibling-return")!;

    expect(activation.endMessageId).toBeUndefined();
    expect(activation.rect.y + activation.rect.height).toBe(fragment.dividerYs[0]);
    expect(activation.rect.y + activation.rect.height).toBeLessThan(siblingReturn.y);
  });

  test("uses the latest operand return when branches close the same outer activation", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "outer-call", from: "p1", to: "p2", line: "sync", text: "begin" },
      {
        kind: "fragment",
        id: "branches",
        op: "alt",
        operands: [
          {
            guard: "first",
            items: [
              { kind: "message", id: "first-return", from: "p2", to: "p1", line: "return", text: "first done" },
            ],
          },
          {
            items: [
              { kind: "message", id: "before-second", from: "p3", to: "p1", line: "async", text: "later branch" },
              { kind: "message", id: "second-return", from: "p2", to: "p1", line: "return", text: "second done" },
            ],
          },
        ],
      },
    ]));
    const activation = layout.activations.find(({ startMessageId }) => startMessageId === "outer-call")!;
    const firstReturn = layout.messages.find(({ id }) => id === "first-return")!;
    const secondReturn = layout.messages.find(({ id }) => id === "second-return")!;

    expect(secondReturn.y).toBeGreaterThan(firstReturn.y);
    expect(activation.endMessageId).toBe(secondReturn.id);
    expect(activation.rect.y + activation.rect.height).toBe(secondReturn.y);
  });

  test("keeps fragment edges clear of activation bars and offsets active over-notes", () => {
    const calls: SequenceItem[] = Array.from({ length: 4 }, (_, index) => ({
      kind: "message",
      id: `call-${index}`,
      from: "p1",
      to: "p2",
      line: "sync",
      text: `call ${index}`,
    }));
    const layout = layoutSequence(documentWith([
      ...calls,
      {
        kind: "fragment",
        id: "f1",
        op: "opt",
        operands: [
          {
            guard: "active",
            items: [
              { kind: "message", id: "signal", from: "p1", to: "p2", line: "async", text: "signal" },
            ],
          },
        ],
      },
      { kind: "note", id: "note", anchor: "p2", side: "over", text: "active note" },
    ]));
    const fragment = layout.fragments[0]!;
    const frameRight = fragment.outer.x + fragment.outer.width;
    const barsInFrame = layout.activations.filter(({ participantId, rect }) =>
      participantId === "p2"
      && rect.y <= fragment.outer.y + fragment.outer.height
      && rect.y + rect.height >= fragment.outer.y
    );
    const rightmostBarEdge = Math.max(
      ...barsInFrame.map(({ rect }) => rect.x + rect.width),
    );
    const participant = layout.participants.find(({ id }) => id === "p2")!;
    const note = layout.notes[0]!;

    expect(frameRight - rightmostBarEdge).toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.FRAG_PAD);
    expect(note.box.x + note.box.width / 2).toBe(
      participant.centerX + SEQUENCE_LAYOUT.ACTIVATION_W / 2,
    );
  });

  test("surface margin, column gap, and row gap overrides flow into geometry", () => {
    const items: SequenceItem[] = [
      { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "one" },
      { kind: "message", id: "m2", from: "p2", to: "p3", line: "async", text: "two" },
    ];
    const base = layoutSequence(documentWith(items));
    const wide = layoutSequence(documentWith(items, {
      surface: { margin: 48, columnGap: 280, rowGap: 72 },
    }));

    const baseSeparation = base.participants[1]!.centerX - base.participants[0]!.centerX;
    const wideSeparation = wide.participants[1]!.centerX - wide.participants[0]!.centerX;
    expect(baseSeparation).toBe(SEQUENCE_LAYOUT.COLUMN_GAP);
    expect(wideSeparation).toBe(280);

    const baseRowGap = base.rows[1]!.y - base.rows[0]!.y;
    const wideRowGap = wide.rows[1]!.y - wide.rows[0]!.y;
    expect(baseRowGap).toBe(SEQUENCE_LAYOUT.ROW_H);
    expect(wideRowGap).toBe(72);

    // Margin grows the top inset and the trailing edge below the content.
    expect(wide.participants[0]!.header.y).toBe(48);
    expect(base.participants[0]!.header.y).toBe(SEQUENCE_LAYOUT.MARGIN);
  });

  test("participant padding widens headers and activation width sizes bars", () => {
    const items: SequenceItem[] = [
      { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "call" },
      { kind: "message", id: "m2", from: "p2", to: "p1", line: "return", text: "done" },
    ];
    const measure = (text: string): number => text.length * 20;
    const base = layoutSequence(documentWith(items), measure);
    const styled = layoutSequence(documentWith(items, {
      participant: { padding: 40 },
      activation: { width: 24 },
    }), measure);

    const baseHeader = base.participants[1]!.header.width;
    const styledHeader = styled.participants[1]!.header.width;
    expect(baseHeader).toBe(measure("service") + SEQUENCE_LAYOUT.HEADER_PAD_X * 2);
    expect(styledHeader).toBe(measure("service") + 80);
    expect(base.activations[0]!.rect.width).toBe(SEQUENCE_LAYOUT.ACTIVATION_W);
    expect(styled.activations[0]!.rect.width).toBe(24);
  });

  test("fragment padding, note padding, and message label gap are consumed", () => {
    const items: SequenceItem[] = [
      {
        kind: "fragment",
        id: "f1",
        op: "opt",
        operands: [{
          guard: "ready",
          items: [
            { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "go" },
          ],
        }],
      },
      { kind: "note", id: "n1", anchor: "p2", side: "right", text: "hint" },
    ];
    const base = layoutSequence(documentWith(items));
    const styled = layoutSequence(documentWith(items, {
      fragment: { padding: 32 },
      note: { padding: 20 },
      message: { labelGap: 14 },
    }));

    const baseFragment = base.fragments[0]!;
    const styledFragment = styled.fragments[0]!;
    const baseMessage = base.messages[0]!;
    const styledMessage = styled.messages[0]!;
    expect(Math.min(baseMessage.x1, baseMessage.x2) - baseFragment.outer.x)
      .toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.FRAG_PAD);
    expect(Math.min(styledMessage.x1, styledMessage.x2) - styledFragment.outer.x)
      .toBeGreaterThanOrEqual(32);

    // Note padding grows the box around its text; the label insets with it.
    // Height floor is 24 + 2 * padding (40 at the default padding of 8).
    expect(base.notes[0]!.box.height).toBe(40);
    expect(styled.notes[0]!.box.height).toBe(24 + 40);
    expect(base.notes[0]!.label.x - base.notes[0]!.box.x).toBe(10);
    expect(styled.notes[0]!.label.x - styled.notes[0]!.box.x).toBe(22);

    expect(baseMessage.y - baseMessage.label.y).toBe(6);
    expect(styledMessage.y - styledMessage.label.y).toBe(14);
  });

  test("geometry overrides multiply with the global scale", () => {
    const items: SequenceItem[] = [
      { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "call" },
      { kind: "message", id: "m2", from: "p1", to: "p2", line: "async", text: "again" },
    ];
    const layout = layoutSequence(documentWith(items, {
      scale: 2,
      surface: { rowGap: 48 },
      activation: { width: 20 },
    }));

    expect(layout.rows[1]!.y - layout.rows[0]!.y).toBe(96);
    expect(layout.activations[0]!.rect.width).toBe(40);
  });

  test("ends unmatched calls at their operand boundary and keeps all numbers finite", () => {
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "f1",
        op: "opt",
        operands: [
          {
            guard: "needed",
            items: [
              { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "unmatched" },
            ],
          },
        ],
      },
      { kind: "message", id: "m2", from: "p2", to: "p1", line: "return", text: "outside scope" },
    ], { scale: Number.NaN }));
    const activation = layout.activations[0]!;
    const fragment = layout.fragments[0]!;

    expect(activation.endMessageId).toBeUndefined();
    expect(activation.rect.y + activation.rect.height).toBeLessThanOrEqual(
      fragment.outer.y + fragment.outer.height,
    );
    expect(layout.scale).toBe(1);

    const visit = (value: unknown): void => {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(layout);
  });
});
