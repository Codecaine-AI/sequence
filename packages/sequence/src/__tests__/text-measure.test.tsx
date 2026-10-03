import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import {
  activeBackend,
  measureWidth,
  uncoveredChars,
  useTableBackend,
  type FontSpec,
} from "@codecaine-ai/text-measure";
import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

import {
  SEQUENCE_LAYOUT,
  SequenceViewer,
  layoutSequence,
  renderSequenceSvgString,
  singleLineText,
  validateSequenceDocument,
  type SeqFont,
  type SequenceDocument,
  type SequenceLayout,
} from "../index";
import { minimal } from "../fixtures";

afterEach(cleanup);

function svgElement(markup: string): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host.querySelector("svg")!;
}

/** The font a `<text>` is painted with, as a text-measure FontSpec. */
function drawnFontSpec(text: Element): FontSpec {
  const family = /^var\(--seq-font-family, (.*)\)$/.exec(text.getAttribute("font-family") ?? "")?.[1];
  expect(family).toBeDefined();
  // Without it Chromium re-shapes SVG text at a rounded size when the diagram is displayed scaled.
  expect(text.getAttribute("text-rendering")).toBe("geometricPrecision");
  return {
    family: family!,
    size: Number(text.getAttribute("font-size")),
    weight: Number(text.getAttribute("font-weight")),
  };
}

/** The strings one `<text>` paints: one per tspan, else its whole content. */
function drawnLines(text: Element): string[] {
  const spans = [...text.querySelectorAll("tspan")];
  return spans.length > 0 ? spans.map((span) => span.textContent ?? "") : [text.textContent ?? ""];
}

/**
 * Lines broken the way a browser breaks them for a box `maxWidth` wide: none
 * wider than the box, and none that could have taken the next line's first
 * word. Paragraphs in these fixtures are separated by a blank line.
 */
function expectBrowserLineBreaks(lines: string[], font: FontSpec, maxWidth: number): void {
  lines.forEach((line, index) => {
    expect(measureWidth(line, font)).toBeLessThanOrEqual(maxWidth);
    const next = lines[index + 1];
    if (line === "" || next === undefined || next === "") return;
    expect(measureWidth(`${line} ${next.split(" ")[0]}`, font)).toBeGreaterThan(maxWidth);
  });
}

function visitNumbers(value: unknown, visit: (value: number) => void): void {
  if (typeof value === "number") visit(value);
  else if (Array.isArray(value)) value.forEach((item) => visitNumbers(item, visit));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => visitNumbers(item, visit));
}

const scale = 1.25;
const checkout: SequenceDocument = {
  version: 1,
  id: "checkout",
  title: "Checkout:   a diagram title long enough to wrap onto a second line, even though the checkout diagram drawn below it is wide at one and a quarter scale",
  participants: [
    { id: "a", name: "browser", kind: "actor", label: "Customer   browser" },
    { id: "b", name: "api", kind: "participant", label: "Checkout API gateway", stereotype: "edge  service" },
    { id: "c", name: "db", kind: "participant", label: "Orders database" },
  ],
  items: [
    {
      kind: "message",
      id: "m1",
      from: "a",
      to: "b",
      line: "sync",
      text: "POST /checkout with the\nwhole cart   and a payment token",
    },
    {
      kind: "note",
      id: "n1",
      anchor: "b",
      side: "right",
      text: "validates   the cart, reserves stock,\n\n  and charges the card before it replies",
    },
    {
      kind: "fragment",
      id: "f1",
      op: "loop",
      operands: [{
        guard: "each line item",
        items: [
          { kind: "message", id: "m2", from: "b", to: "c", line: "sync", text: "reserve" },
          { kind: "message", id: "m3", from: "c", to: "b", line: "return", text: "ok" },
        ],
      }],
    },
    { kind: "message", id: "m4", from: "b", to: "a", line: "return", text: "201 Created" },
  ],
  style: { scale },
};

describe("default text metrics (text-measure)", () => {
  test("tests measure on the HarfBuzz backend despite happy-dom", () => {
    expect(typeof document.createElement).toBe("function");
    expect(activeBackend()).toEqual({ name: "harfbuzz", exact: true });
  });

  test("participant, message, note, title, and tab widths are measureWidth in the drawn font", () => {
    const layout = layoutSequence(checkout);
    const svg = svgElement(renderSequenceSvgString(checkout));
    const unit = (value: number): number => value * scale;

    for (const participant of layout.participants) {
      const group = svg.querySelector(`.seq-participants [data-participant-id="${participant.id}"]`)!;
      const label = group.querySelector(".seq-participant-label")!;
      const stereotype = group.querySelector(".seq-stereotype");
      const source = checkout.participants.find(({ id }) => id === participant.id)!;
      // Single-line labels are drawn and measured with whitespace collapsed.
      expect(label.textContent).toBe(singleLineText(source.label ?? source.name));
      const textWidth = Math.max(
        measureWidth(label.textContent!, drawnFontSpec(label)),
        stereotype ? measureWidth(stereotype.textContent!, drawnFontSpec(stereotype)) : 0,
      );
      expect(participant.header.width).toBeCloseTo(
        Math.max(unit(64), textWidth + unit(SEQUENCE_LAYOUT.HEADER_PAD_X * 2)),
        9,
      );
    }
    const stereotype = svg.querySelector(".seq-participants .seq-stereotype")!;
    expect(stereotype.textContent).toBe("«edge service»");

    // The long first message alone decides the first column span.
    const label = svg.querySelector('[data-item-id="m1"] .seq-message-label')!;
    expect(label.textContent).toBe("POST /checkout with the whole cart and a payment token");
    const [first, second] = layout.participants;
    expect(second!.centerX - first!.centerX).toBeCloseTo(
      measureWidth(label.textContent!, drawnFontSpec(label))
        + unit(SEQUENCE_LAYOUT.ACTIVATION_W * 2 + 24),
      9,
    );

    const note = layout.notes[0]!;
    const noteText = svg.querySelector(".seq-note text")!;
    const noteFont = drawnFontSpec(noteText);
    const noteContentWidth = note.box.width - 2 * (note.label.x - note.box.x);
    expect(note.lines.length).toBeGreaterThan(3);
    expect(note.lines).toContain("");
    expect(note.lines.filter((line) => line !== "").join(" ")).toBe(
      "validates the cart, reserves stock, and charges the card before it replies",
    );
    expectBrowserLineBreaks(note.lines, noteFont, noteContentWidth);
    expect(drawnLines(noteText)).toEqual(note.lines.filter((line) => line !== ""));

    const title = layout.title!;
    const titleText = svg.querySelector(".seq-title")!;
    const titleFont = drawnFontSpec(titleText);
    const titleContentWidth = layout.width - 2 * title.anchor.x;
    expect(title.lines.length).toBeGreaterThan(1);
    expect(title.lines.join(" ")).toBe(singleLineText(checkout.title!));
    expectBrowserLineBreaks(title.lines, titleFont, titleContentWidth);
    expect(drawnLines(titleText)).toEqual(title.lines);

    const fragment = layout.fragments[0]!;
    const op = svg.querySelector(".seq-fragment-op")!;
    expect(fragment.tab.width).toBeCloseTo(measureWidth(op.textContent!, drawnFontSpec(op)) + unit(30), 9);
  });

  test("the viewer lays out again when the text-measure backend changes", async () => {
    // Non-ASCII kerning: the advance table is about 2.6px wider than HarfBuzz here.
    const doc: SequenceDocument = {
      ...minimal,
      participants: [{ id: "p1", name: "VÅ TÄ YÖ ŤŶ", kind: "participant" }, minimal.participants[1]!],
    };
    const { container } = render(<SequenceViewer document={doc} />);
    const headerWidth = (): number => Number(
      container.querySelector('.seq-participants [data-participant-id="p1"] rect')!.getAttribute("width"),
    );
    const expected = (): number => layoutSequence(doc).participants[0]!.header.width;
    const exact = headerWidth();
    expect(exact).toBeCloseTo(expected(), 3);

    try {
      act(() => useTableBackend());
      expect(activeBackend().name).toBe("table");
      expect(headerWidth()).toBeCloseTo(expected(), 3);
      expect(headerWidth()).toBeGreaterThan(exact + 1);
    } finally {
      await act(async () => {
        await useHarfBuzz();
      });
    }
    expect(activeBackend().name).toBe("harfbuzz");
    expect(headerWidth()).toBe(exact);
  });

  test("text the bundled faces lack (CJK, emoji) still lays out", () => {
    const doc: SequenceDocument = {
      version: 1,
      id: "uncovered",
      title: "注文フロー 📦 with a mixed title",
      participants: [
        { id: "u", name: "利用者 👩🏽‍💻", kind: "actor" },
        { id: "s", name: "서비스 🚀", kind: "participant", stereotype: "백엔드" },
      ],
      items: [
        { kind: "message", id: "m1", from: "u", to: "s", line: "sync", text: "注文を送信する 🛒" },
        {
          kind: "note",
          id: "n1",
          anchor: "s",
          side: "right",
          text: "在庫を確認してから決済を行います。🎉 Then the order is confirmed and shipped.",
        },
        { kind: "message", id: "m2", from: "s", to: "u", line: "return", text: "✅ 完了" },
      ],
      style: {},
    };
    for (const text of ["利用者 👩🏽‍💻", "서비스 🚀", "在庫 🎉"]) {
      expect(uncoveredChars(text).length).toBeGreaterThan(0);
    }

    let layout: SequenceLayout | undefined;
    expect(() => {
      layout = layoutSequence(doc);
    }).not.toThrow();
    visitNumbers(layout, (value) => expect(Number.isFinite(value)).toBe(true));
    const svg = svgElement(renderSequenceSvgString(doc));

    const label = svg.querySelector('.seq-participants [data-participant-id="u"] .seq-participant-label')!;
    expect(label.textContent).toBe("利用者 👩🏽‍💻");
    expect(layout!.participants[0]!.header.width)
      .toBeGreaterThanOrEqual(measureWidth(label.textContent!, drawnFontSpec(label)) + 32);

    const note = layout!.notes[0]!;
    const noteFont = drawnFontSpec(svg.querySelector(".seq-note text")!);
    const contentWidth = note.box.width - 2 * (note.label.x - note.box.x);
    expect(note.lines.length).toBeGreaterThan(1);
    expect(note.lines.join("").replaceAll(" ", "")).toBe(doc.items[1]!.kind === "note"
      ? doc.items[1]!.text.replaceAll(" ", "")
      : "");
    for (const line of note.lines) expect(measureWidth(line, noteFont)).toBeLessThanOrEqual(contentWidth);
  });

  test("notes still wrap inside their box when another library initialized Pretext first", () => {
    // Pretext keeps the first measuring context in a process, so the conflict
    // runs in a child process: text-measure's wrapText then throws.
    const headless = Bun.resolveSync("@codecaine-ai/text-measure/headless", import.meta.dir);
    const pretext = Bun.resolveSync("@chenglou/pretext", dirname(headless));
    const layoutModule = join(import.meta.dir, "..", "layout.ts");
    const doc: SequenceDocument = {
      version: 1,
      id: "pretext-first",
      participants: [{ id: "a", name: "A", kind: "participant" }],
      items: [{ kind: "note", id: "n", anchor: "a", side: "right", text: "long note ".repeat(10) }],
      style: {},
    };
    const dir = mkdtempSync(join(tmpdir(), "sequence-pretext-first-"));
    const script = join(dir, "pretext-first.ts");
    writeFileSync(script, `
      const { useHarfBuzz, wrapText } = await import(${JSON.stringify(headless)});
      await useHarfBuzz();
      globalThis.OffscreenCanvas = class {
        getContext() { return { font: "", measureText: (text) => ({ width: text.length * 8 }) }; }
      };
      const pretext = await import(${JSON.stringify(pretext)});
      pretext.prepare("another library's label", "400 12px Inter");
      delete globalThis.OffscreenCanvas;
      let wrapThrows = false;
      try { wrapText("a b", { family: "Inter", size: 12 }, { maxWidth: 140, lineHeight: 15 }); } catch { wrapThrows = true; }
      const warnings = [];
      console.warn = (...args) => warnings.push(args.join(" "));
      const { layoutSequence } = await import(${JSON.stringify(layoutModule)});
      const doc = ${JSON.stringify(doc)};
      const notes = [layoutSequence(doc), layoutSequence(doc)].map((layout) => layout.notes[0]);
      console.log(JSON.stringify({ wrapThrows, warnings, notes }));
    `);
    try {
      const child = Bun.spawnSync([process.execPath, script], { stdout: "pipe", stderr: "pipe" });
      expect(child.stderr.toString()).toBe("");
      const result = JSON.parse(child.stdout.toString()) as {
        wrapThrows: boolean;
        warnings: string[];
        notes: SequenceLayout["notes"];
      };
      for (const note of result.notes) {
        const contentWidth = note.box.width - 2 * (note.label.x - note.box.x);
        expect(note.lines.length).toBeGreaterThan(1);
        for (const line of note.lines) {
          expect(measureWidth(line, { family: "Inter", size: 12, weight: 400 })).toBeLessThanOrEqual(contentWidth);
        }
      }
      // One warning per process when the fallback runs, none otherwise.
      expect(result.warnings).toHaveLength(result.wrapThrows ? 1 : 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("code points XML forbids are dropped from the measured and the drawn text alike", () => {
    const doc: SequenceDocument = {
      version: 1,
      id: "xml-controls",
      title: "Title\u0000 with\u0001 controls\uFFFF",
      participants: [
        { id: "a", name: "Alpha\u0000Beta\u0008 Gamma", kind: "participant", stereotype: "edge\u001F" },
        { id: "b", name: "b", kind: "participant" },
      ],
      items: [
        { kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "call\u000B me\uD800" },
        { kind: "note", id: "n1", anchor: "b", side: "right", text: "note\u0007 text\fwith a form feed" },
        {
          kind: "fragment",
          id: "f1",
          op: "opt",
          operands: [{
            guard: "ready\u001B",
            items: [{ kind: "message", id: "m2", from: "b", to: "a", line: "return", text: "ok" }],
          }],
        },
      ],
      style: {},
    };
    expect(validateSequenceDocument(doc).ok).toBe(true);
    const measured: string[] = [];
    const measure = (text: string, font: SeqFont): number => {
      measured.push(text);
      return measureWidth(text, { family: font.family, size: font.size, weight: Number(font.weight) });
    };
    const markup = renderSequenceSvgString(doc, measure);

    // Everything outside the XML 1.0 Char production makes standalone SVG unparseable.
    expect(markup).not.toMatch(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u);
    const svg = svgElement(markup);
    const label = svg.querySelector('.seq-participants [data-participant-id="a"] .seq-participant-label')!;
    expect(label.textContent).toBe("AlphaBeta Gamma");
    expect(svg.querySelector('[data-item-id="m1"] .seq-message-label')!.textContent).toBe("call me");
    expect(drawnLines(svg.querySelector(".seq-note text")!).join(" ")).toBe("note text with a form feed");
    for (const text of svg.querySelectorAll(".seq-participant-label, .seq-stereotype, .seq-message-label, .seq-fragment-guard")) {
      expect(measured).toContain(text.textContent!);
    }
  });

  test("bidirectional control characters lay out without throwing", () => {
    // Measured in logical order: the width is not guaranteed (see README).
    const doc: SequenceDocument = {
      ...minimal,
      participants: [
        { id: "p1", name: "\u202ETo XTo XTo X\u202C", kind: "participant" },
        minimal.participants[1]!,
      ],
      style: { participant: { padding: 0 } },
    };
    expect(() => renderSequenceSvgString(doc)).not.toThrow();
    visitNumbers(layoutSequence(doc), (value) => expect(Number.isFinite(value)).toBe(true));
  });
});
