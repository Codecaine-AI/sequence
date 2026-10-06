import type { StudioDraft } from "@/shared/draft-store";
import { DraftEditor } from "./_components/DraftEditor";
import { StatusPage } from "./_components/StatusPage";
import type { ShellSlots } from "./types";

export type { ShellSlots } from "./types";

export type EditorPageProps = {
  /**
   * The open draft as App found it in the store, or undefined when it is
   * missing. App owns that answer, so the shell chrome and this page agree.
   */
  draft: StudioDraft | undefined;
  slots: ShellSlots;
  /** The draft was renamed: App re-reads the store for the nav. */
  onDraftsChanged: () => void;
  /** Closes the Style inspector and returns focus to its toggle. */
  onCloseStyle: () => void;
  onBack: () => void;
};

/** The editor route: the draft's editor, or the not-found page. */
export function EditorPage({
  draft,
  slots,
  onDraftsChanged,
  onCloseStyle,
  onBack,
}: EditorPageProps) {
  if (!draft) {
    return <StatusPage message="This draft was not found." onBack={onBack} />;
  }

  return (
    <DraftEditor
      draft={draft}
      slots={slots}
      onDraftsChanged={onDraftsChanged}
      onCloseStyle={onCloseStyle}
    />
  );
}
