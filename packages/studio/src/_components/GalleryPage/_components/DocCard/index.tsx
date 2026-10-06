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

/** A gallery card: the whole card is a button that opens the document. */
export function DocCard({ title, document, hint, tag, actions, onOpen }: DocCardProps) {
  return (
    <button type="button" className="doc-card" title={hint} onClick={onOpen}>
      <SequenceThumbnail document={document} />
      <span className="card-title-row">
        <span className="card-title">{title}</span>
        {tag ? <span className="card-tag">{tag}</span> : null}
      </span>
      {actions ? <span className="card-actions">{actions}</span> : null}
    </button>
  );
}
