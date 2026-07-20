import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { SequenceViewer, renderSequenceSvgString } from "../index";
import { combinedFragments, loginFlow, minimal } from "../fixtures";

afterEach(cleanup);

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
