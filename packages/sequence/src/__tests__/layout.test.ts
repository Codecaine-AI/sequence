import { describe, expect, test } from "bun:test";
import { measureWidth } from "@codecaine-ai/text-measure";

import {
  SEQUENCE_LAYOUT,
  SEQUENCE_TYPOGRAPHY,
  layoutSequence,
  sequenceFont,
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

/** Bars on every lifeline but p1's, the first caller's, which gets a caller-side bar. */
function calleeBars(layout: ReturnType<typeof layoutSequence>) {
  return layout.activations.filter(({ participantId }) => participantId !== "p1");
}

describe("layoutSequence", () => {
  test("uses the pinned base constants and assigns strictly increasing item rows", () => {
    expect(SEQUENCE_LAYOUT).toEqual({
      GRID: 8,
      COLUMN_GAP: 140,
      HEADER_H: 40,
      FOOTER_GAP: 24,
      HEADER_PAD_X: 16,
      ROW_H: 40,
      ACTIVATION_W: 12,
      FRAG_PAD: 18,
      FRAG_TAB_H: 20,
      FRAG_MARGIN_Y: 24,
      FRAG_INNER_TOP: 20,
      FRAG_INNER_PAD: 24,
      FRAG_NESTED_TOP: 4,
      FRAG_GUARD_H: 40,
      FRAG_GUARD_BASELINE: 18,
      GUARD_SHIFT_MAX: 120,
      LABEL_CLEARANCE: 12,
      NOTE_MARGIN_Y: 8,
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
    const activation = calleeBars(layout)[0]!;
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

    expect(calleeBars(layout).map(({ level }) => level)).toEqual([0, 1]);
    expect(calleeBars(layout)[1]!.rect.x).toBeGreaterThan(calleeBars(layout)[0]!.rect.x);
    expect(calleeBars(layout)[1]!.endMessageId).toBe("m4");
    expect(calleeBars(layout)[0]!.endMessageId).toBe("m5");
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
    const pieces = layout.activations.filter(({ startMessageId, participantId }) => startMessageId === "call" && participantId === "p2");
    const activation = pieces[pieces.length - 1]!;
    const nestedReturn = layout.messages.find(({ id }) => id === "nested-return")!;

    const call = layout.messages.find(({ id }) => id === "call")!;

    expect(activation.endMessageId).toBe(nestedReturn.id);
    expect(activation.rect.y + activation.rect.height).toBe(nestedReturn.y);
    // The return sits in the first operand of each frame, so the bar runs
    // as one piece from its call across both frames' top edges.
    expect(pieces).toHaveLength(1);
    expect(activation.rect.y).toBe(call.y);
  });

  test("an operand that does not return an outer bar gives its own calls their bars", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "check" },
      {
        kind: "fragment",
        id: "branches",
        op: "alt",
        operands: [
          { guard: "stale", items: [{ kind: "message", id: "refuse", from: "p2", to: "p1", line: "return", text: "409" }] },
          {
            guard: "fresh",
            items: [
              { kind: "message", id: "tell", from: "p1", to: "p3", line: "async", text: "tell" },
              { kind: "message", id: "ask", from: "p1", to: "p2", line: "sync", text: "ask" },
            ],
          },
        ],
      },
    ]));
    const ask = layout.messages.find(({ id }) => id === "ask")!;
    const askBar = layout.activations.find(({ startMessageId }) => startMessageId === "ask");

    expect(askBar?.rect.y).toBe(ask.y);
    // The arrow docks on its own bar.
    expect(ask.x2).toBe(askBar!.rect.x);
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
    // The bar ends at its operand's content boundary, clear of the divider.
    expect(activation.rect.y + activation.rect.height).toBeLessThan(fragment.dividerYs[0]!);
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
    const activation = layout.activations.findLast(({ startMessageId }) => startMessageId === "outer-call")!;
    const firstReturn = layout.messages.find(({ id }) => id === "first-return")!;
    const secondReturn = layout.messages.find(({ id }) => id === "second-return")!;

    expect(secondReturn.y).toBeGreaterThan(firstReturn.y);
    expect(activation.endMessageId).toBe(secondReturn.id);
    expect(activation.rect.y + activation.rect.height).toBe(secondReturn.y);
  });

  test("a call with no return gets a short bar over its own row, not one to the end", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "fire" },
      { kind: "message", id: "later", from: "p1", to: "p3", line: "async", text: "later" },
      { kind: "message", id: "last", from: "p3", to: "p1", line: "async", text: "last" },
    ]));
    const call = layout.messages.find(({ id }) => id === "call")!;
    const later = layout.messages.find(({ id }) => id === "later")!;
    const bar = calleeBars(layout)[0]!;

    expect(calleeBars(layout)).toHaveLength(1);
    expect(bar.rect.y).toBe(call.y);
    expect(bar.rect.y + bar.rect.height).toBe(call.y + SEQUENCE_LAYOUT.ROW_H / 2);
    expect(bar.rect.y + bar.rect.height).toBeLessThan(later.y);
  });

  test("a short bar covers the receiver's next rows and stops at the first row without it", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "start" },
      { kind: "message", id: "onward", from: "p2", to: "p3", line: "async", text: "onward" },
      { kind: "message", id: "back", from: "p3", to: "p2", line: "async", text: "back" },
      { kind: "message", id: "elsewhere", from: "p1", to: "p3", line: "async", text: "elsewhere" },
    ]));
    const back = layout.messages.find(({ id }) => id === "back")!;
    const elsewhere = layout.messages.find(({ id }) => id === "elsewhere")!;
    const bar = calleeBars(layout)[0]!;

    expect(bar.rect.y + bar.rect.height).toBe(back.y + SEQUENCE_LAYOUT.ROW_H / 2);
    expect(bar.rect.y + bar.rect.height).toBeLessThan(elsewhere.y);
  });

  test("a call with no return onto an active lifeline adds no stacked bar", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "outer", from: "p1", to: "p2", line: "sync", text: "outer" },
      { kind: "message", id: "fire", from: "p3", to: "p2", line: "sync", text: "fire" },
      { kind: "message", id: "done", from: "p2", to: "p1", line: "return", text: "done" },
    ]));
    const fire = layout.messages.find(({ id }) => id === "fire")!;

    expect(calleeBars(layout)).toHaveLength(1);
    expect(calleeBars(layout)[0]!.endMessageId).toBe("done");
    // The arrow docks on the open bar.
    expect(fire.x2).toBe(calleeBars(layout)[0]!.rect.x + calleeBars(layout)[0]!.rect.width);
  });

  test("a second call from the same caller ends the first call's short bar", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "first", from: "p1", to: "p2", line: "sync", text: "first" },
      { kind: "message", id: "second", from: "p1", to: "p2", line: "sync", text: "second" },
      { kind: "message", id: "done", from: "p2", to: "p1", line: "return", text: "done" },
    ]));
    const [first, second] = calleeBars(layout);
    const secondCall = layout.messages.find(({ id }) => id === "second")!;

    expect(calleeBars(layout).map(({ level }) => level)).toEqual([0, 0]);
    expect(first!.rect.y + first!.rect.height).toBeLessThanOrEqual(secondCall.y);
    expect(second!.endMessageId).toBe("done");
  });

  test("a bar returned inside alt operands shows one piece per operand, never crossing a divider", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "begin" },
      {
        kind: "fragment",
        id: "branches",
        op: "alt",
        operands: [
          {
            guard: "ok",
            items: [
              { kind: "message", id: "ok-return", from: "p2", to: "p1", line: "return", text: "ok" },
            ],
          },
          {
            guard: "cancel",
            items: [
              { kind: "message", id: "cancel", from: "p1", to: "p3", line: "async", text: "cancel" },
              { kind: "message", id: "cancel-return", from: "p2", to: "p1", line: "return", text: "stopped" },
            ],
          },
          {
            guard: "other",
            items: [
              { kind: "message", id: "unrelated", from: "p1", to: "p3", line: "async", text: "unrelated" },
            ],
          },
        ],
      },
    ]));
    const fragment = layout.fragments[0]!;
    const pieces = layout.activations.filter(({ startMessageId, participantId }) => startMessageId === "call" && participantId === "p2");
    const okReturn = layout.messages.find(({ id }) => id === "ok-return")!;
    const cancelReturn = layout.messages.find(({ id }) => id === "cancel-return")!;
    const crosses = (y: number) => pieces.some(({ rect }) => rect.y < y && rect.y + rect.height > y);

    // From the call through the first operand, then in the second; none in
    // the third operand, which does not open with a row on this lifeline.
    expect(pieces).toHaveLength(2);
    expect(crosses(fragment.outer.y)).toBe(true);
    for (const dividerY of fragment.dividerYs) expect(crosses(dividerY)).toBe(false);
    expect(pieces[0]!.rect.y + pieces[0]!.rect.height).toBe(okReturn.y);
    expect(pieces[1]!.rect.y + pieces[1]!.rect.height).toBe(cancelReturn.y);
  });

  test("a guard wider than a column gap runs through no lifeline", () => {
    const guard = "every reviewer passes in the latest round";
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "branches",
        op: "alt",
        operands: [
          { guard, items: [{ kind: "message", id: "ok", from: "p1", to: "p3", line: "async", text: "ok" }] },
          { guard: "check or goal fails in rounds 1 to 3", items: [{ kind: "message", id: "fix", from: "p1", to: "p2", line: "async", text: "fix" }] },
        ],
      },
    ]));
    const fragment = layout.fragments[0]!;
    const [first, second] = layout.participants;

    expect(second!.centerX - first!.centerX).toBeGreaterThan(SEQUENCE_LAYOUT.COLUMN_GAP);
    for (const { box } of fragment.guardLabels) {
      for (const { centerX } of layout.participants) {
        expect(centerX > box.x && centerX < box.x + box.width).toBe(false);
      }
    }
  });

  test("in a later operand, a bar opened above the frame shows again at its lifeline's first row there", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "run" },
      { kind: "message", id: "inner", from: "p2", to: "p3", line: "sync", text: "work" },
      {
        kind: "fragment",
        id: "branches",
        op: "alt",
        operands: [
          {
            guard: "ends",
            items: [
              { kind: "message", id: "inner-done", from: "p3", to: "p2", line: "return", text: "done" },
              { kind: "message", id: "done", from: "p2", to: "p1", line: "return", text: "result" },
            ],
          },
          {
            guard: "cancelled",
            items: [
              { kind: "message", id: "abort", from: "p1", to: "p2", line: "async", text: "abort" },
              { kind: "message", id: "aborted", from: "p3", to: "p2", line: "return", text: "aborted" },
              { kind: "message", id: "stopped", from: "p2", to: "p1", line: "return", text: "stopped" },
            ],
          },
        ],
      },
    ]));
    const fragment = layout.fragments[0]!;
    const guardBottom = fragment.guardLabels[1]!.box.y + fragment.guardLabels[1]!.box.height;
    const message = (id: string) => layout.messages.find((row) => row.id === id)!;
    const later = (start: string) => layout.activations
      .filter(({ startMessageId, participantId, rect }) => startMessageId === start && participantId !== "p1" && rect.y > fragment.dividerYs[0]!);

    // The arrow that reaches p2 starts its piece, below the guard row.
    expect(later("call").map(({ rect }) => rect.y)).toEqual([message("abort").y]);
    expect(message("abort").y).toBeGreaterThan(guardBottom);
    // p3 first sends in this operand: its piece starts at that row's band.
    const [inner] = later("inner");
    expect(inner!.rect.y).toBeGreaterThan(message("abort").y);
    expect(inner!.rect.y + inner!.rect.height).toBe(message("aborted").y);
  });

  test("a bar that returns after a frame runs whole through it", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "begin" },
      {
        kind: "fragment",
        id: "f1",
        op: "loop",
        operands: [{
          guard: "each",
          items: [{ kind: "message", id: "work", from: "p2", to: "p3", line: "async", text: "work" }],
        }],
      },
      { kind: "message", id: "done", from: "p2", to: "p1", line: "return", text: "done" },
    ]));
    const done = layout.messages.find(({ id }) => id === "done")!;

    expect(calleeBars(layout)).toHaveLength(1);
    expect(calleeBars(layout)[0]!.rect.y + calleeBars(layout)[0]!.rect.height).toBe(done.y);
  });

  test("a caller that waits on sync calls is active for its turn, and an async notification starts a new turn", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "ask", from: "p1", to: "p2", line: "sync", text: "ask" },
      { kind: "message", id: "read", from: "p2", to: "p3", line: "sync", text: "read" },
      { kind: "message", id: "row", from: "p3", to: "p2", line: "return", text: "row" },
      { kind: "message", id: "reply", from: "p2", to: "p1", line: "return", text: "reply" },
      { kind: "message", id: "notify", from: "p3", to: "p2", line: "async", text: "notify" },
      { kind: "message", id: "status", from: "p2", to: "p3", line: "sync", text: "status" },
      { kind: "message", id: "result", from: "p3", to: "p2", line: "return", text: "result" },
      { kind: "message", id: "report", from: "p2", to: "p1", line: "async", text: "report" },
    ]));
    const message = (id: string) => layout.messages.find((row) => row.id === id)!;
    const span = (participantId: string) => layout.activations
      .filter((bar) => bar.participantId === participantId)
      .map(({ rect }) => [rect.y, rect.y + rect.height]);

    // p1 waits from its first send until the reply.
    expect(span("p1")).toEqual([[message("ask").y, message("reply").y]]);
    // p2: the bar of the call it got, then a turn from the notification to
    // its last send, which it covers like a call with no return would.
    expect(span("p2")).toEqual([[message("ask").y, message("reply").y], [message("notify").y, message("report").y + SEQUENCE_LAYOUT.ROW_H / 2]]);
    // The notification docks on the new bar.
    expect(message("notify").x2).toBe(layout.activations.find(({ startMessageId }) => startMessageId === "notify")!.rect.x + SEQUENCE_LAYOUT.ACTIVATION_W);
  });

  test("a caller's turn runs whole through an alt to its last step in any operand, and an answer to its own message continues it", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "start", from: "p1", to: "p2", line: "sync", text: "start" },
      { kind: "message", id: "started", from: "p2", to: "p1", line: "return", text: "started" },
      {
        kind: "fragment",
        id: "branches",
        op: "alt",
        operands: [
          { guard: "known", items: [{ kind: "message", id: "send", from: "p1", to: "p2", line: "async", text: "send" }] },
          {
            items: [
              { kind: "message", id: "question", from: "p1", to: "p3", line: "async", text: "question" },
              { kind: "message", id: "answer", from: "p3", to: "p1", line: "async", text: "answer" },
              { kind: "message", id: "send-answer", from: "p1", to: "p2", line: "async", text: "send" },
            ],
          },
        ],
      },
      { kind: "message", id: "relay", from: "p2", to: "p3", line: "async", text: "relay" },
    ]));
    const fragment = layout.fragments[0]!;
    const message = (id: string) => layout.messages.find((row) => row.id === id)!;
    const pieces = layout.activations.filter(({ participantId }) => participantId === "p1");

    // One bar: the caller is active throughout the alt, so the bar crosses
    // the frame's top edge and its divider, and ends at the last operand's
    // last send, covering that row's band.
    expect(pieces).toHaveLength(1);
    expect([pieces[0]!.rect.y, pieces[0]!.rect.y + pieces[0]!.rect.height])
      .toEqual([message("start").y, message("send-answer").y + SEQUENCE_LAYOUT.ROW_H / 2]);
    expect(pieces[0]!.rect.y).toBeLessThan(fragment.outer.y);
    for (const dividerY of fragment.dividerYs) {
      expect(pieces[0]!.rect.y < dividerY && pieces[0]!.rect.y + pieces[0]!.rect.height > dividerY).toBe(true);
    }
    // p3 only passes async messages on: it never waits, so it gets no bar.
    expect(layout.activations.filter(({ participantId }) => participantId === "p3")).toEqual([]);
  });

  test("a self-call on an active lifeline nests and covers its own row only", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "hook", from: "p2", to: "p1", line: "async", text: "hook" },
      { kind: "message", id: "check", from: "p1", to: "p1", line: "sync", text: "check" },
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "call" },
      { kind: "message", id: "back", from: "p2", to: "p1", line: "return", text: "back" },
    ]));
    const check = layout.messages.find(({ id }) => id === "check")!;
    const selfBar = layout.activations.find(({ startMessageId }) => startMessageId === "check")!;

    expect(selfBar.level).toBe(1);
    expect(selfBar.rect.y + selfBar.rect.height).toBe(check.y + SEQUENCE_LAYOUT.ROW_H);
  });

  test("a self-call's loop starts near the top of its row, where another message's label would sit", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "before", from: "p1", to: "p2", line: "async", text: "before" },
      { kind: "message", id: "check", from: "p2", to: "p2", line: "sync", text: "check" },
      { kind: "message", id: "after", from: "p2", to: "p1", line: "async", text: "after" },
    ]));
    const [before, check, after] = ["before", "check", "after"].map((id) => layout.messages.find((message) => message.id === id)!);

    expect(check!.y - before!.y).toBe(SEQUENCE_LAYOUT.ROW_H / 2 + SEQUENCE_LAYOUT.GRID);
    expect(after!.y - check!.y2).toBe(SEQUENCE_LAYOUT.ROW_H);
  });

  test("keeps fragment edges clear of activation bars and moves active over-notes beside the bar", () => {
    const calls: SequenceItem[] = Array.from({ length: 4 }, (_, index) => ({
      kind: "message",
      id: `call-${index}`,
      from: "p1",
      to: "p2",
      line: "sync",
      text: `call ${index}`,
    }));
    const returns: SequenceItem[] = calls.map((_, index) => ({
      kind: "message",
      id: `return-${index}`,
      from: "p2",
      to: "p1",
      line: "return",
      text: `done ${index}`,
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
      ...returns,
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
    const barsRight = Math.max(...layout.activations
      .filter(({ participantId, rect }) =>
        participantId === participant.id
        && rect.y < note.box.y + note.box.height
        && rect.y + rect.height > note.box.y)
      .map(({ rect }) => rect.x + rect.width));
    // The bars stay whole: the note sits right of the nested stack, not on it.
    expect(note.box.x).toBeGreaterThan(barsRight);
    expect(note.box.x - barsRight).toBeLessThanOrEqual(SEQUENCE_LAYOUT.GRID);
    // And clear of the next lifeline.
    const next = layout.participants.find(({ id }) => id === "p3")!;
    expect(note.box.x + note.box.width).toBeLessThan(next.centerX - SEQUENCE_LAYOUT.ACTIVATION_W / 2);
  });

  test("a guard that an activation bar runs through moves past the bar", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "call" },
      {
        kind: "fragment",
        id: "f1",
        op: "alt",
        operands: [
          { guard: "ok", items: [{ kind: "message", id: "m1", from: "p2", to: "p3", line: "async", text: "work" }] },
          { guard: "each turn", items: [{ kind: "message", id: "m2", from: "p2", to: "p3", line: "async", text: "more" }] },
        ],
      },
      { kind: "message", id: "back", from: "p2", to: "p1", line: "return", text: "done" },
    ]));
    const bar = layout.activations.find(({ participantId }) => participantId === "p2")!.rect;
    const fragment = layout.fragments[0]!;
    // The second guard starts at the frame's left inset, on the p2 bar.
    const guard = fragment.guardLabels[1]!;

    expect(bar.y).toBeLessThan(guard.box.y);
    expect(guard.box.x).toBeGreaterThanOrEqual(bar.x + bar.width);
    expect(guard.box.x + guard.box.width).toBeLessThanOrEqual(fragment.outer.x + fragment.outer.width);
  });

  test("a guard moved past a bar keeps LABEL_CLEARANCE from it, and a tab ends clear of the first lifeline's bar", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "call" },
      {
        kind: "fragment",
        id: "f1",
        op: "alt",
        operands: [
          { guard: "the thread reads done or missing", items: [{ kind: "message", id: "m1", from: "p2", to: "p3", line: "async", text: "work" }] },
          { guard: "the thread reads open again", items: [{ kind: "message", id: "m2", from: "p2", to: "p3", line: "async", text: "more" }] },
        ],
      },
      { kind: "message", id: "back", from: "p2", to: "p1", line: "return", text: "done" },
    ]));
    const bar = layout.activations.find(({ participantId }) => participantId === "p2")!.rect;
    const fragment = layout.fragments[0]!;
    const clearance = SEQUENCE_LAYOUT.LABEL_CLEARANCE;

    // p2 is the frame's leftmost lifeline: the tab stops short of its bar.
    expect(fragment.tab.x + fragment.tab.width).toBeLessThanOrEqual(bar.x - clearance);
    // Both guards would run through the bar from the frame's inset, so they move past it.
    for (const guard of fragment.guardLabels) {
      expect(guard.anchor.x).toBeGreaterThanOrEqual(bar.x + bar.width + clearance);
    }
  });

  test("a run of returns from a callee to its caller all leave its bar, and the last one ends it", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "ask", from: "p1", to: "p2", line: "sync", text: "ask" },
      { kind: "message", id: "result", from: "p2", to: "p1", line: "return", text: "result" },
      { kind: "message", id: "settled", from: "p2", to: "p1", line: "return", text: "settled" },
    ]));
    const message = (id: string) => layout.messages.find((row) => row.id === id)!;
    const bar = calleeBars(layout)[0]!;

    expect(calleeBars(layout)).toHaveLength(1);
    expect(bar.endMessageId).toBe("settled");
    expect(bar.rect.y + bar.rect.height).toBe(message("settled").y);
    // Both returns dock on the bar's edge.
    expect(message("result").x1).toBe(bar.rect.x);
    expect(message("settled").x1).toBe(bar.rect.x);
  });

  test("a guard moves off a lifeline when a clear stretch of its frame holds it", () => {
    // The guard starts after the tab, on the p2 lifeline. The long p2-p3
    // arrow makes that stretch wide enough to hold it.
    const guardText = "[the cache missed]";
    const measure = (text: string): number => text === guardText ? 130 : text.length * 7;
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "f1",
        op: "opt",
        operands: [{
          guard: "the cache missed",
          items: [
            { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "ask" },
            { kind: "message", id: "m2", from: "p2", to: "p3", line: "async", text: "x".repeat(60) },
          ],
        }],
      },
    ], { surface: { columnGap: 120 } }), measure);
    const guard = layout.fragments[0]!.guardLabels[0]!;

    for (const { centerX } of layout.participants) {
      expect(centerX < guard.box.x || centerX > guard.box.x + guard.box.width).toBe(true);
    }
  });

  test("a self-call label stops short of the next lifeline", () => {
    const measure = (text: string): number => text.length * 7;
    const text = "admit one run (capacity 1, overlap queue)";
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "admit", from: "p2", to: "p2", line: "sync", text },
    ]), measure);
    const admit = layout.messages.find(({ id }) => id === "admit")!;
    const next = layout.participants.find(({ id }) => id === "p3")!;

    expect(admit.label.x + measure(text)).toBeLessThan(next.centerX - SEQUENCE_LAYOUT.ACTIVATION_W / 2);
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

  test("a label on an arrow that passes an activation bar moves into a clear stretch of the arrow", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "call" },
      { kind: "message", id: "past", from: "p1", to: "p3", line: "async", text: "passes the bar" },
      { kind: "message", id: "back", from: "p2", to: "p1", line: "return", text: "done" },
    ]));
    const past = layout.messages.find(({ id }) => id === "past")!;
    const bar = layout.activations.find(({ participantId }) => participantId === "p2")!.rect;
    const box = past.labelBox;

    expect(bar.y).toBeLessThan(box.y);
    expect(bar.y + bar.height).toBeGreaterThan(box.y + box.height);
    // Clear of the bar, on the arrow, on the sender's side.
    expect(box.x + box.width).toBeLessThanOrEqual(bar.x);
    expect(box.x).toBeGreaterThanOrEqual(past.x1);
  });

  test("frames keep vertical clearance from neighboring rows and sibling frames", () => {
    const optOperand = (id: string) => ({
      guard: "ready",
      items: [
        { kind: "message", id, from: "p1", to: "p2", line: "async", text: "go" } as SequenceItem,
      ],
    });
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "before", from: "p1", to: "p2", line: "async", text: "before" },
      { kind: "fragment", id: "f1", op: "opt", operands: [optOperand("m1")] },
      { kind: "fragment", id: "f2", op: "opt", operands: [optOperand("m2")] },
      { kind: "message", id: "after", from: "p2", to: "p1", line: "async", text: "after" },
    ]));
    const before = layout.messages.find(({ id }) => id === "before")!;
    const after = layout.messages.find(({ id }) => id === "after")!;
    const f1 = layout.fragments.find(({ id }) => id === "f1")!;
    const f2 = layout.fragments.find(({ id }) => id === "f2")!;

    expect(f1.outer.y - before.y2).toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.FRAG_MARGIN_Y);
    // Sibling margins collapse into one.
    expect(f2.outer.y - (f1.outer.y + f1.outer.height)).toBe(SEQUENCE_LAYOUT.FRAG_MARGIN_Y);
    expect(after.y - (f2.outer.y + f2.outer.height))
      .toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.FRAG_MARGIN_Y);
  });

  test("fragment interiors keep air below the tab and above the bottom edge", () => {
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "f1",
        op: "opt",
        operands: [{
          guard: "ready",
          items: [
            { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "one" },
            { kind: "message", id: "m2", from: "p2", to: "p1", line: "async", text: "two" },
          ],
        }],
      },
    ]));
    const fragment = layout.fragments[0]!;
    const first = layout.messages.find(({ id }) => id === "m1")!;
    const last = layout.messages.find(({ id }) => id === "m2")!;
    const tabBottom = fragment.outer.y + SEQUENCE_LAYOUT.FRAG_TAB_H;

    expect(first.y1 - tabBottom).toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.FRAG_INNER_TOP);
    expect(fragment.outer.y + fragment.outer.height - last.y2).toBe(SEQUENCE_LAYOUT.FRAG_INNER_PAD);
  });

  test("nested frames that close together step their bottom edges by the inner pad, with no stacked margins", () => {
    const opt = (id: string, items: SequenceItem[]): SequenceItem => ({
      kind: "fragment", id, op: "opt", operands: [{ guard: id, items }],
    });
    const layout = layoutSequence(documentWith([
      opt("outer", [
        { kind: "message", id: "m0", from: "p1", to: "p2", line: "async", text: "first" },
        opt("middle", [
          { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "second" },
          opt("inner", [
            { kind: "message", id: "m2", from: "p1", to: "p2", line: "async", text: "last" },
          ]),
        ]),
      ]),
      { kind: "message", id: "after", from: "p2", to: "p1", line: "async", text: "after" },
    ]));
    const bottom = (id: string): number => {
      const frame = layout.fragments.find((fragment) => fragment.id === id)!.outer;
      return frame.y + frame.height;
    };
    const last = layout.messages.find(({ id }) => id === "m2")!;
    const after = layout.messages.find(({ id }) => id === "after")!;

    // Every frame keeps the same pad below its last content, a frame included.
    expect(bottom("inner") - last.y2).toBe(SEQUENCE_LAYOUT.FRAG_INNER_PAD);
    expect(bottom("middle") - bottom("inner")).toBe(SEQUENCE_LAYOUT.FRAG_INNER_PAD);
    expect(bottom("outer") - bottom("middle")).toBe(SEQUENCE_LAYOUT.FRAG_INNER_PAD);
    // The outermost frame still keeps one margin before the next row.
    expect(after.y - SEQUENCE_LAYOUT.ROW_H / 2 - bottom("outer")).toBe(SEQUENCE_LAYOUT.FRAG_MARGIN_Y);
  });

  test("nested frames step inward with visible top and bottom insets", () => {
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "outer",
        op: "loop",
        operands: [{
          guard: "each",
          items: [
            {
              kind: "fragment",
              id: "inner",
              op: "opt",
              operands: [{
                guard: "ready",
                items: [
                  { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "go" },
                ],
              }],
            },
          ],
        }],
      },
    ]));
    const outer = layout.fragments.find(({ id }) => id === "outer")!;
    const inner = layout.fragments.find(({ id }) => id === "inner")!;

    expect(inner.outer.y - (outer.outer.y + SEQUENCE_LAYOUT.FRAG_TAB_H))
      .toBe(SEQUENCE_LAYOUT.FRAG_INNER_TOP + SEQUENCE_LAYOUT.FRAG_NESTED_TOP);
    expect((outer.outer.y + outer.outer.height) - (inner.outer.y + inner.outer.height))
      .toBe(SEQUENCE_LAYOUT.FRAG_INNER_PAD);
  });

  test("a frame ends just right of the rightmost lifeline its steps use, not at that header's edge", () => {
    const doc = documentWith([
      {
        kind: "fragment",
        id: "f1",
        op: "opt",
        operands: [{ guard: "x", items: [{ kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "go" }] }],
      },
    ]);
    doc.participants = participants.map((participant) =>
      participant.id === "p2" ? { ...participant, name: "a service with a very long header name" } : participant);
    const layout = layoutSequence(doc);
    const frame = layout.fragments[0]!.outer;
    const service = layout.participants.find(({ id }) => id === "p2")!;

    expect(frame.x + frame.width).toBe(service.centerX + SEQUENCE_LAYOUT.FRAG_PAD);
    expect(frame.x + frame.width).toBeLessThan(service.header.x + service.header.width);
  });

  test.each([
    ["messages only", [
      { kind: "message", id: "m1", from: "p1", to: "p3", line: "sync", text: "store(x)" },
    ]],
    ["a frame with a right note", [
      {
        kind: "fragment",
        id: "f1",
        op: "loop",
        operands: [{ guard: "each item", items: [
          { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "next()" },
          { kind: "note", id: "n1", anchor: "p3", side: "right", text: "keeps a log" },
        ] }],
      },
    ]],
  ] as [string, SequenceItem[]][])("the right margin is as wide as the left one: %s", (_name, items) => {
    const layout = layoutSequence(documentWith(items));
    const boxes: SeqRect[] = [
      ...layout.participants.map(({ header }) => header),
      ...layout.fragments.map(({ outer }) => outer),
      ...layout.notes.map(({ box }) => box),
    ];
    const left = Math.min(...boxes.map(({ x }) => x));
    const right = Math.max(...boxes.map(({ x, width }) => x + width));

    expect(layout.width - right).toBe(left);
  });

  test("operand dividers keep clearance from surrounding operand contents", () => {
    const layout = layoutSequence(documentWith([
      {
        kind: "fragment",
        id: "f1",
        op: "alt",
        operands: [
          {
            guard: "yes",
            items: [
              { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "one" },
            ],
          },
          {
            items: [
              { kind: "message", id: "m2", from: "p2", to: "p1", line: "async", text: "two" },
            ],
          },
        ],
      },
    ]));
    const fragment = layout.fragments[0]!;
    const dividerY = fragment.dividerYs[0]!;
    const above = layout.messages.find(({ id }) => id === "m1")!;
    const below = layout.messages.find(({ id }) => id === "m2")!;
    const elseGuard = fragment.guardLabels[1]!;

    // A divider sits as far below its operand's last arrow as a bottom edge.
    expect(dividerY - above.y2).toBe(SEQUENCE_LAYOUT.FRAG_INNER_PAD);
    // The [else] guard sits in its own band between the divider and the items,
    // and the next operand opens as far below the divider as the first one
    // opens below the frame's top edge.
    expect(elseGuard.anchor.y).toBe(dividerY + SEQUENCE_LAYOUT.FRAG_GUARD_BASELINE);
    expect(below.y1 - dividerY).toBe(above.y1 - fragment.outer.y);
  });

  test("notes keep vertical clearance from neighboring messages", () => {
    const layout = layoutSequence(documentWith([
      { kind: "message", id: "before", from: "p1", to: "p2", line: "async", text: "before" },
      { kind: "note", id: "n1", anchor: "p2", side: "right", text: "a note" },
      { kind: "message", id: "after", from: "p2", to: "p1", line: "async", text: "after" },
    ]));
    const note = layout.notes[0]!;
    const before = layout.messages.find(({ id }) => id === "before")!;
    const after = layout.messages.find(({ id }) => id === "after")!;

    expect(note.box.y - before.y2).toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.NOTE_MARGIN_Y);
    expect(after.y1 - (note.box.y + note.box.height))
      .toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.NOTE_MARGIN_Y);
  });

  test("notes, and frames around them, stop short of other lifelines and their nested bars", () => {
    const halfBar = SEQUENCE_LAYOUT.ACTIVATION_W / 2;
    const nestedCalls: SequenceItem[] = Array.from({ length: 3 }, (_, index) => ({
      kind: "message",
      id: `self-${index}`,
      from: "p2",
      to: "p2",
      line: "sync",
      text: "recurse",
    }));
    const framedNote: SequenceItem = {
      kind: "fragment",
      id: "outer",
      op: "opt",
      operands: [{
        items: [{
          kind: "fragment",
          id: "inner",
          op: "opt",
          operands: [{
            items: [{ kind: "note", id: "framed", anchor: "p1", side: "right", text: "inside two frames" }],
          }],
        }],
      }],
    };
    // 40 is the smallest column gap the studio offers; 140 is the default.
    for (const columnGap of [40, 140]) {
      const layout = layoutSequence(documentWith([
        { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "call" },
        ...nestedCalls,
        { kind: "note", id: "right", anchor: "p1", side: "right", text: "right of the caller" },
        { kind: "note", id: "left", anchor: "p3", side: "left", text: "left of the store" },
        { kind: "note", id: "over", anchor: "p2", side: "over", text: "over the active service" },
        framedNote,
        ...nestedCalls.map((_, index): SequenceItem => ({
          kind: "message", id: `self-return-${index}`, from: "p2", to: "p2", line: "return", text: "",
        })),
        { kind: "message", id: "m2", from: "p2", to: "p1", line: "return", text: "done" },
      ], { surface: { columnGap } }));
      expect(Math.max(...layout.activations.map(({ level }) => level))).toBe(3);
      expect(layout.notes).toHaveLength(4);

      // The frames hold only p1's note, so they belong to p1's column too.
      const extents = [
        ...layout.notes.map(({ anchorId, box }) => ({ owner: anchorId, left: box.x, right: box.x + box.width })),
        ...layout.fragments.map(({ outer }) => ({ owner: "p1", left: outer.x, right: outer.x + outer.width })),
      ];
      for (const extent of extents) {
        for (const participant of layout.participants) {
          if (participant.id === extent.owner) continue;
          const occupied = [
            { x: participant.centerX - halfBar, width: halfBar * 2 },
            ...layout.activations
              .filter(({ participantId }) => participantId === participant.id)
              .map(({ rect }) => rect),
          ];
          for (const rect of occupied) {
            expect(rect.x + rect.width <= extent.left || rect.x >= extent.right).toBe(true);
          }
        }
      }
    }
  });

  test("message labels stay inside their arrow after nested activation docking", () => {
    const text = "long label for a request";
    const font = sequenceFont("message");
    const width = measureWidth(text, { family: font.family, size: font.size, weight: 400 });
    for (const calls of [12, 20]) {
      const selfCalls: SequenceItem[] = Array.from({ length: calls }, (_, index) => ({
        kind: "message",
        id: `s${index}`,
        from: "p1",
        to: "p1",
        line: "sync",
        text: "",
      }));
      const layout = layoutSequence(documentWith([
        ...selfCalls,
        { kind: "message", id: "out", from: "p1", to: "p2", line: "async", text },
        { kind: "message", id: "back", from: "p2", to: "p1", line: "async", text },
        ...selfCalls.map((_, index): SequenceItem => ({
          kind: "message", id: `r${index}`, from: "p1", to: "p1", line: "return", text: "",
        })),
      ]));
      expect(Math.max(...layout.activations.map(({ level }) => level))).toBe(calls - 1);
      for (const message of layout.messages.filter(({ text: label }) => label === text)) {
        expect(message.label.x - width / 2).toBeGreaterThanOrEqual(Math.min(message.x1, message.x2));
        expect(message.label.x + width / 2).toBeLessThanOrEqual(Math.max(message.x1, message.x2));
      }
    }
  });

  test("a wrapped note balances its lines instead of leaving one word alone", () => {
    for (const text of ["statusGroup stays as it is", "verify again on the current plan, from round 1"]) {
      const layout = layoutSequence(documentWith([
        { kind: "note", id: "n", anchor: "p2", side: "over", text },
      ]));
      const lines = layout.notes[0]!.lines;
      const font = sequenceFont("note");
      const widths = lines.map((line) => measureWidth(line, { family: font.family, size: font.size, weight: 400 }));

      expect(lines.length).toBeGreaterThan(1);
      expect(lines.join(" ")).toBe(text);
      expect(lines[lines.length - 1]!.includes(" ")).toBe(true);
      expect(widths[widths.length - 1]!).toBeGreaterThan(Math.max(...widths) / 2);
    }
  });

  test("a message label below a note clears the box at the smallest row gap", () => {
    // Inter's ascender (2728 / 2816 em) reaches the top of accented capitals;
    // the label's background box covers it.
    const ascent = (2728 / 2816) * SEQUENCE_TYPOGRAPHY.message.size;
    for (const text of ["Label", "Émile"]) {
      const layout = layoutSequence(documentWith([
        { kind: "note", id: "n", anchor: "p1", side: "right", text: "wrapped" },
        { kind: "message", id: "m", from: "p1", to: "p2", line: "async", text },
      ], { surface: { rowGap: 16 } }));
      const note = layout.notes[0]!;
      const message = layout.messages[0]!;
      expect(message.labelBox.y).toBeLessThanOrEqual(message.label.y - ascent);
      expect(message.labelBox.y + 1e-9).toBeGreaterThanOrEqual(note.box.y + note.box.height);
    }
  });

  test("a title keeps the participant row below its last line, even at a small row gap", () => {
    const items: SequenceItem[] = [
      { kind: "message", id: "m1", from: "p1", to: "p2", line: "async", text: "one" },
    ];
    const long = "A title long enough to wrap onto more than one line in this small diagram, ".repeat(2);
    const descent = SEQUENCE_TYPOGRAPHY.title.size * 0.25;
    // 16 is the smallest row gap the studio offers; 40 is the default.
    for (const rowGap of [16, 40]) {
      for (const title of ["Short title", long]) {
        const layout = layoutSequence({ ...documentWith(items, { surface: { rowGap } }), title });
        const header = layout.participants[0]!.header;
        const lastBaseline = layout.title!.anchor.y
          + (layout.title!.lines.length - 1) * layout.title!.lineHeight;

        expect(header.y - (lastBaseline + descent)).toBeGreaterThanOrEqual(SEQUENCE_LAYOUT.GRID);
        expect(header.y - SEQUENCE_LAYOUT.MARGIN).toBeGreaterThanOrEqual(rowGap);
      }
    }
    expect(layoutSequence({ ...documentWith(items), title: long }).title!.lines.length)
      .toBeGreaterThan(1);
  });

  test("wraps note text over a plain measurer and grows the box per line", () => {
    // 10px per grapheme; the 160px note minus a 10px inset per side leaves
    // 140px, so 14 graphemes fit on a line.
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const measure = (text: string): number => [...segmenter.segment(text)].length * 10;
    const cases: Array<{ text: string; lines: string[] }> = [
      { text: "alpha beta gamma delta epsilon", lines: ["alpha beta", "gamma delta", "epsilon"] },
      { text: "one\n\nthree", lines: ["one", "", "three"] },
      // The over-long word breaks between graphemes: "e" + U+0301 stays whole.
      { text: "abcdefghijklméxyz", lines: ["abcdefghijklmé", "xyz"] },
    ];
    const descent = SEQUENCE_TYPOGRAPHY.note.size * 0.25;
    for (const { text, lines } of cases) {
      const note = layoutSequence(documentWith([
        { kind: "note", id: "n1", anchor: "p2", side: "right", text },
      ]), measure).notes[0]!;
      expect(note.lines).toEqual(lines);
      const lastBaseline = note.label.y + (lines.length - 1) * note.lineHeight;
      expect(lastBaseline + descent).toBeLessThanOrEqual(note.box.y + note.box.height);
    }
  });
});


describe("standard participant layout", () => {
  test("mirrors participants below all events and connects lifelines to the footer", () => {
    for (const scale of [0.5, 1, 2]) {
      const doc = documentWith([
        { kind: "message", id: "call", from: "p1", to: "p2", line: "sync", text: "request" },
        { kind: "message", id: "reply", from: "p2", to: "p1", line: "return", text: "response" },
      ], { scale });
      doc.participants = doc.participants.map(p => ({ ...p, stereotype: "system" }));
      const layout = layoutSequence(doc);
      expect(layout.participantFooters.map(p => p.id)).toEqual(doc.participants.map(p => p.id));
      for (const [index, footer] of layout.participantFooters.entries()) {
        const header = layout.participants[index]!;
        expect(footer.centerX).toBe(header.centerX);
        expect(footer.header.width).toBe(header.header.width);
        expect(footer.actor).toBe(header.actor);
        expect(footer.header.y).toBeGreaterThan(Math.max(...layout.messages.map(m => m.y2)));
        expect(footer.header.y).toBeGreaterThan(Math.max(...layout.activations.map(a => a.rect.y + a.rect.height)));
        expect(footer.header.y + footer.header.height).toBeLessThan(layout.height);
        expect(footer.stereotypeAnchor!.y - footer.header.y).toBeCloseTo(header.stereotypeAnchor!.y - header.header.y);
        expect(layout.lifelines[index]!.y2).toBe(footer.header.y);
      }
    }
  });

  test("reserves enough horizontal space for long nested message labels", () => {
    const text = "publish reconciled source and knowledge";
    const layout = layoutSequence(documentWith([{
      kind: "fragment", id: "branch", op: "alt", operands: [{ guard: "success", items: [
        { kind: "message", id: "long", from: "p1", to: "p2", line: "sync", text },
      ] }],
    }]), (value) => value.length * 10);
    const message = layout.messages[0]!;
    expect(Math.abs(message.x2 - message.x1)).toBeGreaterThan(text.length * 10);
    expect(message.label.x - text.length * 5).toBeGreaterThan(message.x1);
    expect(message.label.x + text.length * 5).toBeLessThan(message.x2);
  });
});
