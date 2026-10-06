import { SequenceViewer, type SequenceDocument } from "@codecaine-ai/sequence";
import "./styles.css";

export type SequenceThumbnailProps = {
  document: SequenceDocument;
};

/**
 * A live, scaled-down viewer clipped inside the card. Spans (not divs)
 * because the whole card is a <button>; everything is display: block in CSS.
 */
export function SequenceThumbnail({ document }: SequenceThumbnailProps) {
  return (
    <span className="card-thumb" aria-hidden="true">
      <span className="card-thumb-inner">
        <SequenceViewer document={document} />
      </span>
    </span>
  );
}
