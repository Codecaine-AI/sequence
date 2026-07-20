import type { CSSProperties } from "react";

import { layoutSequence } from "../layout";
import type { SequenceDocument } from "../schema";
import { sequenceStyleToCssVars } from "../theme";
import { renderSequenceSvgContents, wrapSequenceSvg } from "./svg";

export interface SequenceDiagramProps {
  document: SequenceDocument;
  className?: string;
}

export function SequenceDiagram({ document, className }: SequenceDiagramProps) {
  const layout = layoutSequence(document);
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

export function renderSequenceSvgString(document: SequenceDocument): string {
  const layout = layoutSequence(document);
  return wrapSequenceSvg(document, layout, renderSequenceSvgContents(document, layout));
}
