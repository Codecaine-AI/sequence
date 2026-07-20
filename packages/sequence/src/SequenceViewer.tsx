import type { SequenceDocument } from "./schema";
import { SequenceDiagram } from "./render/SequenceDiagram";

export interface SequenceViewerProps {
  document: SequenceDocument;
  className?: string;
}

/** Read-only sequence-diagram embed surface. */
export function SequenceViewer({ document, className }: SequenceViewerProps) {
  return <SequenceDiagram document={document} className={className} />;
}
