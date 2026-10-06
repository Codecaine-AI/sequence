import { SequenceViewer, type SequenceDocument } from "@codecaine-ai/sequence";
import type { KeyboardEvent, MouseEvent } from "react";
import { deleteDraft, renameDraft, type StudioDraft } from "./draft-store";
import { STUDIO_FIXTURES, type StudioFixture } from "./fixtures";

type GalleryPageProps = {
  /** The stored drafts, newest first (App reads them for the nav too). */
  drafts: StudioDraft[];
  onOpenDraft: (draftId: string) => void;
  /** Copies a document into a new draft and opens it. */
  onSeedDraft: (source: SequenceDocument, title: string) => void;
  /** A draft was renamed or deleted: App re-reads the store. */
  onDraftsChanged: () => void;
};

/**
 * A live, scaled-down viewer clipped inside the card. Spans (not divs)
 * because the whole card is a <button>; everything is display: block in CSS.
 */
function SequenceThumbnail({ document }: { document: SequenceDocument }) {
  return (
    <span className="card-thumb" aria-hidden="true">
      <span className="card-thumb-inner">
        <SequenceViewer document={document} />
      </span>
    </span>
  );
}

function CardAction({
  label,
  ariaLabel,
  danger = false,
  onActivate,
}: {
  label: string;
  ariaLabel: string;
  danger?: boolean;
  onActivate: () => void;
}) {
  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    onActivate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={danger ? "card-action danger" : "card-action"}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {label}
    </span>
  );
}

export function GalleryPage({
  drafts,
  onOpenDraft,
  onSeedDraft,
  onDraftsChanged,
}: GalleryPageProps) {
  const openFixture = (fixture: StudioFixture) => {
    onSeedDraft(fixture.document, fixture.label);
  };

  const renameDraftCard = (draft: StudioDraft) => {
    const requested = window.prompt("Rename draft", draft.title)?.trim();
    if (!requested || requested === draft.title) return;
    renameDraft(draft.id, requested);
    onDraftsChanged();
  };

  const deleteDraftCard = (draft: StudioDraft) => {
    if (!window.confirm(`Delete "${draft.title}"?`)) return;
    deleteDraft(draft.id);
    onDraftsChanged();
  };

  return (
    <div className="gallery">
      <section className="gallery-section" aria-label="Examples">
        <h2 className="micro-label">Examples</h2>
        <div className="card-grid">
          {STUDIO_FIXTURES.map((fixture) => (
            <button
              key={fixture.key}
              type="button"
              className="doc-card"
              title={`Open a new draft seeded from ${fixture.label}`}
              onClick={() => openFixture(fixture)}
            >
              <SequenceThumbnail document={fixture.document} />
              <span className="card-title-row">
                <span className="card-title">{fixture.label}</span>
                <span className="card-tag">Example</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="gallery-section" aria-label="Your drafts">
        <h2 className="micro-label">Your drafts</h2>
        {drafts.length === 0 ? (
          <p className="empty-note">
            No drafts yet. Open an example or create a new sequence.
          </p>
        ) : (
          <div className="card-grid">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                className="doc-card"
                onClick={() => onOpenDraft(draft.id)}
              >
                <SequenceThumbnail document={draft.document} />
                <span className="card-title-row">
                  <span className="card-title">{draft.title}</span>
                </span>
                <span className="card-actions">
                  <CardAction
                    label="Rename"
                    ariaLabel={`Rename ${draft.title}`}
                    onActivate={() => renameDraftCard(draft)}
                  />
                  <CardAction
                    label="Delete"
                    ariaLabel={`Delete ${draft.title}`}
                    danger
                    onActivate={() => deleteDraftCard(draft)}
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
