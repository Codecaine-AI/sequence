import { useSyncExternalStore, type CSSProperties } from "react";

import { layoutSequence } from "../layout";
import type { SequenceDocument } from "../schema";
import {
  onSequenceTextMetricsChange,
  sequenceTextMetricsVersion,
  type SequenceMeasureInput,
} from "../text";
import { sequenceStyleToCssVars } from "../theme";
import { renderSequenceSvgContents, wrapSequenceSvg } from "./svg";

export interface SequenceDiagramProps {
  document: SequenceDocument;
  className?: string;
  /**
   * Text metrics for layout: a bare measurer or `{ measure, wrap? }`.
   * Defaults to `@codecaine-ai/text-measure`; the diagram lays out again
   * whenever its backend changes (for example once `useBrowserFonts()` has
   * loaded the bundled fonts).
   */
  measure?: SequenceMeasureInput;
}

export function SequenceDiagram({ document, className, measure }: SequenceDiagramProps) {
  // Re-render, and so re-measure, after every text-measure backend switch.
  useSyncExternalStore(
    onSequenceTextMetricsChange,
    sequenceTextMetricsVersion,
    sequenceTextMetricsVersion,
  );
  const layout = layoutSequence(document, measure);
  const contents = renderSequenceSvgContents(document, layout);
  const classes = className ? `sequence-diagram ${className}` : "sequence-diagram";
  const style = {
    ...sequenceStyleToCssVars(document.style),
    display: "block",
    maxWidth: "100%",
    height: "auto",
  } as CSSProperties;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={classes}
      role="img"
      aria-label={document.title ?? "Sequence diagram"}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: contents }}
    />
  );
}

/**
 * Standalone SVG markup; `measure` is the same optional input `layoutSequence`
 * takes. With the default metrics, call it after the host has loaded fonts
 * (`useHarfBuzz()` in Bun / Node). The measured widths hold only where the
 * SVG paints with the bundled Inter: inline in a page that loads
 * text-measure's fonts.css. Shown through `<img>`, a data URL or a file, the
 * SVG cannot reach page fonts and paints with whatever Inter or fallback font
 * the viewer has.
 */
export function renderSequenceSvgString(
  document: SequenceDocument,
  measure?: SequenceMeasureInput,
): string {
  const layout = layoutSequence(document, measure);
  return wrapSequenceSvg(document, layout, renderSequenceSvgContents(document, layout));
}
