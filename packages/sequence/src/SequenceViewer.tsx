import type { SequenceDocument } from "./schema";
import type { SequenceMeasureInput } from "./text";
import { SequenceDiagram } from "./render/SequenceDiagram";

export interface SequenceViewerProps {
  document: SequenceDocument;
  className?: string;
  /** Text metrics for layout: a bare measurer or `{ measure, wrap? }`. */
  measure?: SequenceMeasureInput;
}

/** Read-only sequence-diagram embed surface. */
export function SequenceViewer({ document, className, measure }: SequenceViewerProps) {
  return <SequenceDiagram document={document} className={className} measure={measure} />;
}
