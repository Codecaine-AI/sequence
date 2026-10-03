import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import {
  SequenceViewer,
  layoutSequence,
  renderSequenceSvgString,
  type SeqFont,
  type SequenceDocument,
  type SequenceTextMetrics,
} from "../index";
import { combinedFragments, loginFlow, minimal } from "../fixtures";

afterEach(cleanup);

function svgElement(markup: string): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host.querySelector("svg")!;
}

/** The strings one `<text>` paints: one per tspan, else its whole content. */
function drawnLines(text: Element): string[] {
  const spans = [...text.querySelectorAll("tspan")];
  return spans.length > 0 ? spans.map((span) => span.textContent ?? "") : [text.textContent ?? ""];
}

function spanOffsets(text: Element): number[] {
  return [...text.querySelectorAll("tspan")].map((span) => Number(span.getAttribute("dy")));
}

/** Deterministic measurer: half an em per UTF-16 code unit. */
const halfEm = (text: string, font: SeqFont): number => text.length * font.size * 0.5;

function drawnFont(text: Element): SeqFont {
  return {
    size: Number(text.getAttribute("font-size")),
    family: text.getAttribute("font-family") ?? "",
    weight: Number(text.getAttribute("font-weight")),
  };
}

function withNote(text: string, extra: Partial<SequenceDocument> = {}): SequenceDocument {
  return {
    ...minimal,
    ...extra,
    items: [...minimal.items, { kind: "note", id: "note-1", anchor: "p2", side: "right", text }],
  };
}

describe("sequence text measurement", () => {
  test("measures every painted text in the font the SVG draws it with", () => {
    const calls: Array<{ text: string; font: SeqFont }> = [];
    const measure = (text: string, font: SeqFont): number => {
      calls.push({ text, font });
      return halfEm(text, font);
    };
    const doc: SequenceDocument = {
      version: 1,
      id: "font-parity",
      title: "Font parity",
      participants: [
        { id: "p1", name: "user", kind: "actor" },
        { id: "p2", name: "api", kind: "participant", label: "Gateway", stereotype: "service" },
      ],
      items: [
        { kind: "message", id: "m1", from: "p1", to: "p2", line: "sync", text: "call gateway" },
        {
          kind: "fragment",
          id: "f1",
          op: "alt",
          operands: [
            {
              guard: "cached",
              items: [
                { kind: "message", id: "m2", from: "p2", to: "p2", line: "async", text: "self check" },
              ],
            },
            { items: [{ kind: "note", id: "n1", anchor: "p2", side: "right", text: "cold path" }] },
          ],
        },
        { kind: "message", id: "m3", from: "p2", to: "p1", line: "return", text: "reply" },
      ],
      style: { scale: 1.5 },
    };
    const { container } = render(<SequenceViewer document={doc} measure={measure} />);
    const texts = [...container.querySelectorAll("text")];

    expect(texts.length).toBeGreaterThanOrEqual(10);
    for (const text of texts) {
      const drawn = drawnFont(text);
      // Hosts can only guarantee widths for the bundled family.
      expect(drawn.family.startsWith('var(--seq-font-family, "Inter",')).toBe(true);
      for (const line of drawnLines(text)) {
        const measured = calls.filter((call) => call.text === line);
        expect(measured.length).toBeGreaterThan(0);
        for (const { font } of measured) {
          expect(font.size).toBeCloseTo(drawn.size, 6);
          expect(font.weight).toBe(drawn.weight);
          expect(`var(--seq-font-family, ${font.family})`).toBe(drawn.family);
        }
      }
    }
  });

  test("wraps a long note inside its box", () => {
    const text = "every write lands in the patch ledger, so POST /api/undo can replay the inverse";
    const doc = withNote(text);
    const note = layoutSequence(doc, halfEm).notes[0]!;
    const drawn = svgElement(renderSequenceSvgString(doc, halfEm)).querySelector(".seq-note text")!;
    const lines = drawnLines(drawn);
    const inset = note.label.x - note.box.x;
    const lastBaseline = Number(drawn.getAttribute("y"))
      + spanOffsets(drawn).reduce((sum, dy) => sum + dy, 0);

    expect(lines.join(" ")).toBe(text);
    for (const line of lines) {
      expect(note.label.x + halfEm(line, drawnFont(drawn)))
        .toBeLessThanOrEqual(note.box.x + note.box.width - inset);
    }
    expect(lastBaseline + drawnFont(drawn).size * 0.25)
      .toBeLessThanOrEqual(note.box.y + note.box.height);
  });

  test("renders explicit note line breaks as separate tspans", () => {
    const doc = withNote("first\nsecond\n\nfourth");
    const note = layoutSequence(doc).notes[0]!;
    const drawn = svgElement(renderSequenceSvgString(doc)).querySelector(".seq-note text")!;
    const spans = [...drawn.querySelectorAll("tspan")];

    expect(drawnLines(drawn)).toEqual(["first", "second", "fourth"]);
    expect(spans.every((span) => span.getAttribute("x") === drawn.getAttribute("x"))).toBe(true);
    // The blank third line emits no span; the next span skips its height.
    expect(spanOffsets(drawn)).toEqual([0, note.lineHeight, 2 * note.lineHeight]);
  });

  test("wraps a title wider than the diagram instead of widening it", () => {
    const title = "A deliberately long diagram title that is much wider than this small two participant diagram ever gets";
    const plain = layoutSequence(minimal, halfEm);
    const titled = layoutSequence({ ...minimal, title }, halfEm);
    const drawn = svgElement(renderSequenceSvgString({ ...minimal, title }, halfEm))
      .querySelector(".seq-title")!;
    const lines = drawnLines(drawn);
    const left = Number(drawn.getAttribute("x"));
    const lastBaseline = Number(drawn.getAttribute("y"))
      + spanOffsets(drawn).reduce((sum, dy) => sum + dy, 0);

    expect(halfEm(title, drawnFont(drawn))).toBeGreaterThan(plain.width);
    expect(titled.width).toBe(plain.width);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(title);
    for (const line of lines) {
      expect(left + halfEm(line, drawnFont(drawn))).toBeLessThanOrEqual(titled.width - left);
    }
    expect(titled.participants[0]!.header.y)
      .toBeGreaterThan(lastBaseline + drawnFont(drawn).size * 0.25);
  });

  test("an injected wrap decides note and title lines at their content widths", () => {
    const requests: Array<{ text: string; maxWidth: number }> = [];
    const metrics: SequenceTextMetrics = {
      measure: halfEm,
      wrap: (text, _font, maxWidth) => {
        requests.push({ text, maxWidth });
        return text.split(" ");
      },
    };
    const doc = withNote("alpha beta gamma", { title: "Two words" });
    const svg = svgElement(renderSequenceSvgString(doc, metrics));
    const layout = layoutSequence(doc, metrics);
    const note = layout.notes[0]!;
    const noteRequest = requests.find(({ text }) => text === "alpha beta gamma")!;
    const titleRequest = requests.find(({ text }) => text === "Two words")!;

    expect(drawnLines(svg.querySelector(".seq-note text")!)).toEqual(["alpha", "beta", "gamma"]);
    expect(drawnLines(svg.querySelector(".seq-title")!)).toEqual(["Two", "words"]);
    expect(noteRequest.maxWidth).toBe(note.box.width - 2 * (note.label.x - note.box.x));
    expect(titleRequest.maxWidth).toBe(layout.width - 2 * layout.title!.anchor.x);
  });
});

describe("sequence SVG rendering", () => {
  test("renders fixture labels in standalone SVG markup", () => {
    expect(renderSequenceSvgString(loginFlow)).toContain("input(username, password)");
    expect(renderSequenceSvgString(combinedFragments)).toContain("dispatch");
    expect(renderSequenceSvgString(minimal)).toContain("request");
  });

  test("defines the three UML arrowhead styles", () => {
    const svg = renderSequenceSvgString(loginFlow);
    expect(svg.match(/<marker\b/g)).toHaveLength(3);
    expect(svg).toContain('data-seq-marker="sync"');
    expect(svg).toContain('data-seq-marker="async"');
    expect(svg).toContain('data-seq-marker="return"');
  });

  test("draws fragment tabs and dashed operand dividers", () => {
    const svg = renderSequenceSvgString(combinedFragments);
    expect(svg).toContain('data-seq-fragment-tab="true"');
    expect(svg).toContain('data-seq-operand-divider="true"');
    expect(svg).toMatch(/data-seq-operand-divider="true"[^>]+stroke-dasharray=/);
  });

  test("document style is installed as inline CSS variables", () => {
    const svg = renderSequenceSvgString({
      ...minimal,
      style: { accent: "#112233", fragmentAccent: "#445566" },
    });
    expect(svg).toContain("--seq-accent: #112233");
    expect(svg).toContain("--seq-fragment-accent: #445566");
  });

  test("the global scale multiplies typography, strokes, and markers", () => {
    const svg = renderSequenceSvgString({ ...minimal, style: { scale: 2 } });
    expect(svg).toContain('font-size="24"');
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('markerWidth="20"');
  });

  test("per-element colors override shortcuts in the SVG output", () => {
    const svg = renderSequenceSvgString({
      ...loginFlow,
      style: {
        accent: "#111111",
        participantFill: "#222222",
        fragmentAccent: "#333333",
        message: { stroke: "#AA0000" },
        participant: { fill: "#00BB00", stroke: "#00CC00", text: "#00DD00" },
        lifeline: { stroke: "#0000EE" },
        fragment: { stroke: "#FF00FF" },
        note: { fill: "#0FF0FF" },
      },
    });
    // Messages and their arrowheads use the per-element stroke, not accent.
    expect(svg).toContain('stroke="#AA0000"');
    expect(svg).toMatch(/data-seq-marker="sync"[^>]*>[^<]*<path[^>]+fill="#AA0000"/);
    expect(svg).toContain('fill="#00BB00"');
    expect(svg).toContain('stroke="#00CC00"');
    expect(svg).toContain('fill="#00DD00"');
    expect(svg).toMatch(/<g class="seq-lifelines">[^]*stroke="#0000EE"/);
    expect(svg).toContain('stroke="#FF00FF"');
    expect(svg).toContain('fill="#0FF0FF"');
    // The unresolved shortcut still applies where no per-element value exists
    // (activation bars keep following the muted default chain, not accent).
    expect(svg).toContain("var(--seq-muted, #9AA0A6)");
  });

  test("shortcuts still color elements that have no per-element override", () => {
    const svg = renderSequenceSvgString({
      ...minimal,
      style: { accent: "#123123", participantFill: "#456456" },
    });
    expect(svg).toMatch(/<g class="seq-lifelines">[^]*stroke="#123123"/);
    expect(svg).toMatch(/class="seq-participant seq-participant--box"[^]*fill="#456456"/);
  });

  test("opacity, lifeline dash, corner radius, and body tint reach the SVG", () => {
    const svg = renderSequenceSvgString({
      ...combinedFragments,
      style: {
        participant: { opacity: 0.8, cornerRadius: 9 },
        lifeline: { dash: 12, opacity: 0.5 },
        message: { opacity: 0.7 },
        activation: { opacity: 0.6 },
        fragment: { bodyOpacity: 0.15 },
        note: { opacity: 0.9 },
      },
    });
    expect(svg).toMatch(/class="seq-participant seq-participant--box"[^>]*opacity="0.8"/);
    expect(svg).toContain('rx="9"');
    expect(svg).toMatch(/<g class="seq-lifelines">[^]*stroke-dasharray="12 12"[^>]*opacity="0.5"/);
    expect(svg).toMatch(/class="seq-message seq-message--[a-z]+"[^>]*opacity="0.7"/);
    expect(svg).toMatch(/<g class="seq-activations">[^]*opacity="0.6"/);
    expect(svg).toMatch(/fill-opacity="0.15"/);

    const withNote = renderSequenceSvgString({
      ...minimal,
      items: [
        ...minimal.items,
        { kind: "note", id: "note-1", anchor: "p2", side: "right", text: "hint" },
      ],
      style: { note: { opacity: 0.9 } },
    });
    expect(withNote).toMatch(/class="seq-note seq-note--[a-z]+"[^>]*opacity="0.9"/);
  });

  test("a lifeline dash of zero renders solid lifelines", () => {
    const svg = renderSequenceSvgString({
      ...minimal,
      style: { lifeline: { dash: 0 } },
    });
    const lifelines = svg.match(/<g class="seq-lifelines">.*?<\/g>/)![0];
    expect(lifelines).not.toContain("stroke-dasharray");
  });

  test("per-element colors are also installed as inline CSS variables", () => {
    const svg = renderSequenceSvgString({
      ...minimal,
      style: {
        surface: { background: "#FAFAF0" },
        lifeline: { stroke: "#0000EE" },
        note: { fill: "#0FF0FF" },
      },
    });
    expect(svg).toContain("--seq-bg: #FAFAF0");
    expect(svg).toContain("--seq-lifeline: #0000EE");
    expect(svg).toContain("--seq-note-fill: #0FF0FF");
  });

  test("SequenceViewer mounts as an accessible SVG", () => {
    render(<SequenceViewer document={loginFlow} className="fixture-viewer" />);
    const diagram = screen.getByRole("img", { name: loginFlow.title ?? "Sequence diagram" });
    expect(diagram.tagName.toLowerCase()).toBe("svg");
    expect(diagram.classList.contains("fixture-viewer")).toBe(true);
    expect(diagram.textContent).toContain("Login page");
  });
});


test("renders matching top and bottom participants, including actors", () => {
  const { container } = render(<SequenceViewer document={loginFlow} />);
  const top = container.querySelectorAll(".seq-participants > .seq-participant");
  const bottom = container.querySelectorAll(".seq-participant-footers > .seq-participant");
  expect(bottom.length).toBe(top.length);
  for (let index = 0; index < top.length; index += 1) {
    expect(bottom[index]!.getAttribute("data-participant-id")).toBe(top[index]!.getAttribute("data-participant-id"));
    expect(bottom[index]!.textContent).toBe(top[index]!.textContent);
    expect(bottom[index]!.classList.contains("seq-participant--actor")).toBe(top[index]!.classList.contains("seq-participant--actor"));
  }
});

test("paints branch labels above activation bars with a background halo", () => {
  const svg = renderSequenceSvgString(combinedFragments);
  expect(svg.indexOf('class="seq-fragment-labels"')).toBeGreaterThan(svg.indexOf('class="seq-activations"'));
  expect(svg).toMatch(/class="seq-fragment-guard"[^>]*paint-order="stroke"/);
});
