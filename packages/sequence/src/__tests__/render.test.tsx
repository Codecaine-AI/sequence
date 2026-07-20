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

  test("SequenceViewer mounts as an accessible SVG", () => {
    render(<SequenceViewer document={loginFlow} className="fixture-viewer" />);
    const diagram = screen.getByRole("img", { name: loginFlow.title ?? "Sequence diagram" });
    expect(diagram.tagName.toLowerCase()).toBe("svg");
    expect(diagram.classList.contains("fixture-viewer")).toBe(true);
    expect(diagram.textContent).toContain("Login page");
  });
});
