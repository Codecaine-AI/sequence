import { SequenceViewer, type SequenceDocument } from "@codecaine-ai/sequence";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  createDraft,
  deleteDraft,
  listDrafts,
  renameDraft,
  type StudioDraft,
} from "./draft-store";
import {
  MINIMAL_FIXTURE,
  STUDIO_FIXTURES,
  cloneSequenceDocument,
  nextDraftId,
  type StudioFixture,
} from "./fixtures";

type GalleryPageProps = {
  onOpenDraft: (draftId: string) => void;
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

export function GalleryPage({ onOpenDraft }: GalleryPageProps) {
  const [drafts, setDrafts] = useState<StudioDraft[]>(listDrafts);

  const refreshDrafts = () => setDrafts(listDrafts());

  const seedDraft = (source: SequenceDocument, title: string) => {
    const document = cloneSequenceDocument(source);
    document.id = nextDraftId(listDrafts());
    const created = createDraft(document, title);
    onOpenDraft(created.id);
  };

  const openFixture = (fixture: StudioFixture) => {
    seedDraft(fixture.document, fixture.label);
  };

  const createNewSequence = () => {
    seedDraft(MINIMAL_FIXTURE.document, "Untitled sequence");
  };

  const renameDraftCard = (draft: StudioDraft) => {
    const requested = window.prompt("Rename draft", draft.title)?.trim();
    if (!requested || requested === draft.title) return;
    renameDraft(draft.id, requested);
    refreshDrafts();
  };

  const deleteDraftCard = (draft: StudioDraft) => {
    if (!window.confirm(`Delete "${draft.title}"?`)) return;
    deleteDraft(draft.id);
    refreshDrafts();
  };

  return (
    <main className="gallery">
      <header className="gallery-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ↦
          </span>
          <h1>Sequence Studio</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={createNewSequence}
        >
          <span aria-hidden="true">+</span> New sequence
        </button>
      </header>

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
    </main>
  );
}
