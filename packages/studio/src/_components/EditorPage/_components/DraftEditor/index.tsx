import {
  applySequenceOperations,
  type SequenceDocument,
  type SequenceStylePatch,
} from "@codecaine-ai/sequence";
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { saveDraft, type StudioDraft } from "@/shared/draft-store";
import { cloneSequenceDocument } from "@/shared/fixtures";
import "./styles.css";
import type { ShellSlots } from "../../types";
import { EditorPreview } from "./_components/EditorPreview";
import { ProgramSidebar } from "./_components/ProgramSidebar";
import { SaveNotice } from "./_components/SaveNotice";
import { StyleRail } from "./_components/StyleRail";
import { TitleInput } from "./_components/TitleInput";
import { useProgram } from "./useProgram";
import { useSaveNotice } from "./useSaveNotice";

export type DraftEditorProps = {
  /**
   * The draft to edit, read once on mount: App keys the editor by draft id,
   * and later renders pass the same draft re-read from the store.
   */
  draft: StudioDraft;
  slots: ShellSlots;
  /** The draft was renamed: App re-reads the store for the nav. */
  onDraftsChanged: () => void;
  /** Closes the Style inspector and returns focus to its toggle. */
  onCloseStyle: () => void;
};

export function DraftEditor({
  draft,
  slots,
  onDraftsChanged,
  onCloseStyle,
}: DraftEditorProps) {
  const { saveNotice, brieflyShowSaved } = useSaveNotice();
  const [doc, setDoc] = useState<SequenceDocument>(() =>
    cloneSequenceDocument(draft.document),
  );
  const docRef = useRef(doc);
  const savedSnapshotRef = useRef(JSON.stringify(draft.document));

  /**
   * Accept a new document; unless the snapshot is unchanged, autosave it to
   * the draft store and flash the save notice.
   */
  const replaceDocument = useCallback(
    (nextDocument: SequenceDocument) => {
      docRef.current = nextDocument;
      setDoc(nextDocument);
      const snapshot = JSON.stringify(nextDocument);
      if (snapshot === savedSnapshotRef.current) return;
      saveDraft(nextDocument);
      savedSnapshotRef.current = snapshot;
      brieflyShowSaved();
    },
    [brieflyShowSaved],
  );

  const { program, setProgram, errors, parseState, formatProgram } = useProgram(
    draft.document,
    docRef,
    replaceDocument,
  );

  const handleProgramChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setProgram(event.currentTarget.value);
  };

  // Style ops go through setStyle only — they never rewrite the program text.
  // setStyle deep-merges one level, so rail rows patch single fields and
  // section resets send explicit nulls to clear them.
  const updateStyle = (style: SequenceStylePatch) => {
    const applied = applySequenceOperations(docRef.current, [
      { type: "setStyle", style },
    ]);
    if (applied.ok) replaceDocument(applied.document);
  };

  const handleRenamed = () => {
    brieflyShowSaved();
    onDraftsChanged();
  };

  // React events from a portal bubble through the component tree (this
  // editor), not the DOM, so the shell inspector's Escape handler never sees
  // keys pressed in the rail. Close it here instead. An Escape that cancels
  // IME composition (isComposing, or the legacy keyCode 229) is not a close.
  const handleRailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    onCloseStyle();
  };

  return (
    <div className="editor">
      {slots.title
        ? createPortal(
            <TitleInput
              draftId={draft.id}
              initialTitle={draft.title}
              onRenamed={handleRenamed}
            />,
            slots.title,
          )
        : null}
      {slots.actions
        ? createPortal(<SaveNotice saved={saveNotice === "saved"} />, slots.actions)
        : null}
      {slots.inspector
        ? createPortal(
            <div onKeyDown={handleRailKeyDown}>
              <StyleRail style={doc.style} onPatch={updateStyle} />
            </div>,
            slots.inspector,
          )
        : null}

      <div className="editor-body">
        <ProgramSidebar
          program={program}
          onProgramChange={handleProgramChange}
          parseState={parseState}
          errors={errors}
          onFormat={formatProgram}
        />
        <EditorPreview document={doc} stale={errors.length > 0} />
      </div>
    </div>
  );
}
