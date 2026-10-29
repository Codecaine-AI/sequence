import type { SequenceDocument } from "@codecaine-ai/sequence";
import type { ReactNode } from "react";
import "./styles.css";
import { SequenceThumbnail } from "./_components/SequenceThumbnail";

export type DocCardProps = {
  title: string;
  document: SequenceDocument;
  /** The card's native tooltip. */
  hint?: string;
  /** A chip beside the title, such as "Example". */
  tag?: string;
  /** Buttons shown over the card on hover and focus. */
  actions?: ReactNode;
  onOpen: () => void;
};

/**
 * A gallery card: a button that opens the document. The actions sit beside
 * it in the same frame, not inside it, since a button cannot nest.
 */
export function DocCard({ title, document, hint, tag, actions, onOpen }: DocCardProps) {
  return (
    <div className="doc-card-frame">
      <button type="button" className="doc-card" title={hint} onClick={onOpen}>
        <SequenceThumbnail document={document} />
        <span className="card-title-row">
          <span className="card-title">{title}</span>
          {tag ? <span className="card-tag">{tag}</span> : null}
        </span>
      </button>
      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}
