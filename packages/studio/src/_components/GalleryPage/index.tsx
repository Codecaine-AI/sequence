import type { SequenceDocument } from "@codecaine-ai/sequence";
import { deleteDraft, renameDraft, type StudioDraft } from "@/shared/draft-store";
import { STUDIO_FIXTURES, type StudioFixture } from "@/shared/fixtures";
import "./styles.css";
import { CardAction } from "./_components/CardAction";
import { DocCard } from "./_components/DocCard";

export type GalleryPageProps = {
  /** The stored drafts, newest first (App reads them for the nav too). */
  drafts: StudioDraft[];
  onOpenDraft: (draftId: string) => void;
  /** Copies a document into a new draft and opens it. */
  onSeedDraft: (source: SequenceDocument, title: string) => void;
  /** A draft was renamed or deleted: App re-reads the store. */
  onDraftsChanged: () => void;
};

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
            <DocCard
              key={fixture.key}
              title={fixture.label}
              document={fixture.document}
              hint={`Open a new draft seeded from ${fixture.label}`}
              tag="Example"
              onOpen={() => openFixture(fixture)}
            />
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
              <DocCard
                key={draft.id}
                title={draft.title}
                document={draft.document}
                onOpen={() => onOpenDraft(draft.id)}
                actions={
                  <>
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
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
