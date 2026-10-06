import {
  SequenceViewer,
  applySequenceOperations,
  parseSequenceProgram,
  serializeSequenceProgram,
  type SequenceDocument,
  type SequenceStylePatch,
} from "@codecaine-ai/sequence";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  listDrafts,
  renameDraft,
  saveDraft,
  type StudioDraft,
} from "./draft-store";
import { cloneSequenceDocument } from "./fixtures";
import { StyleRail } from "./StyleRail";

type ProgramError = { line: number; message: string };

/**
 * Elements in the app shell that the editor fills through portals: the topbar
 * title (the editable draft title), the topbar actions (the save notice) and
 * the inspector body (the Style rail). Null until the shell has mounted them.
 */
export type ShellSlots = {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  inspector: HTMLElement | null;
};

function errorLine(message: string): number {
  const match = message.match(/(?:line\s+|^)(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function errorsFromOperation(messages: string[]): ProgramError[] {
  return messages.map((message) => ({ line: errorLine(message), message }));
}

type EditorPageProps = {
  draftId: string;
  slots: ShellSlots;
  /** The draft was renamed: App re-reads the store for the nav. */
  onDraftsChanged: () => void;
  /** Closes the Style inspector and returns focus to its toggle. */
  onCloseStyle: () => void;
  onBack: () => void;
};

export function EditorPage({
  draftId,
  slots,
  onDraftsChanged,
  onCloseStyle,
  onBack,
}: EditorPageProps) {
  // Loaded once per mount (App keys this component by draft id).
  const initialDraftRef = useRef<StudioDraft | null | undefined>(undefined);
  if (initialDraftRef.current === undefined) {
    initialDraftRef.current =
      listDrafts().find((draft) => draft.id === draftId) ?? null;
  }
  const initialDraft = initialDraftRef.current;

  if (!initialDraft) {
    return (
      <div className="status-page">
        <p>This draft was not found.</p>
        <button type="button" className="btn btn-outline" onClick={onBack}>
          Back to gallery
        </button>
      </div>
    );
  }

  return (
    <DraftEditor
      draft={initialDraft}
      slots={slots}
      onDraftsChanged={onDraftsChanged}
      onCloseStyle={onCloseStyle}
    />
  );
}

function DraftEditor({
  draft,
  slots,
  onDraftsChanged,
  onCloseStyle,
}: {
  draft: StudioDraft;
  slots: ShellSlots;
  onDraftsChanged: () => void;
  onCloseStyle: () => void;
}) {
  const [doc, setDoc] = useState<SequenceDocument>(() =>
    cloneSequenceDocument(draft.document),
  );
  const docRef = useRef(doc);
  const savedSnapshotRef = useRef(JSON.stringify(draft.document));
  const [program, setProgram] = useState(() =>
    serializeSequenceProgram(draft.document),
  );
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [parseState, setParseState] = useState<"valid" | "pending" | "error">(
    "valid",
  );
  const [saveNotice, setSaveNotice] = useState<"idle" | "saved">("idle");
  const noticeTimerRef = useRef<number | null>(null);
  const [titleInput, setTitleInput] = useState(draft.title);
  const titleValueRef = useRef(draft.title);
  const savedTitleRef = useRef(draft.title);

  const brieflyShowSaved = useCallback(() => {
    setSaveNotice("saved");
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setSaveNotice("idle");
      noticeTimerRef.current = null;
    }, 1100);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

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

  // Debounced parse: pending immediately, verdict after 150ms of quiet. The
  // last valid document keeps rendering while the program has errors.
  useEffect(() => {
    setParseState("pending");
    const timer = window.setTimeout(() => {
      const parsed = parseSequenceProgram(program);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        setParseState("error");
        return;
      }

      const applied = applySequenceOperations(docRef.current, [
        { type: "setProgram", program },
      ]);
      if (!applied.ok) {
        setErrors(errorsFromOperation(applied.errors));
        setParseState("error");
        return;
      }

      setErrors([]);
      setParseState("valid");
      replaceDocument(applied.document);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [program, replaceDocument]);

  const handleProgramChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setProgram(event.currentTarget.value);
  };

  const formatProgram = () => {
    const parsed = parseSequenceProgram(program);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setParseState("error");
      return;
    }
    setErrors([]);
    setParseState("valid");
    setProgram(serializeSequenceProgram(parsed.document));
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

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    titleValueRef.current = event.currentTarget.value;
    setTitleInput(event.currentTarget.value);
  };

  const commitTitle = () => {
    const trimmed = titleValueRef.current.trim();
    if (!trimmed || trimmed === savedTitleRef.current) {
      titleValueRef.current = savedTitleRef.current;
      setTitleInput(savedTitleRef.current);
      return;
    }
    renameDraft(draft.id, trimmed);
    savedTitleRef.current = trimmed;
    titleValueRef.current = trimmed;
    setTitleInput(trimmed);
    brieflyShowSaved();
    onDraftsChanged();
  };

  // React events from a portal bubble through the component tree (this
  // editor), not the DOM, so the shell inspector's Escape handler never sees
  // keys pressed in the rail. Close it here instead.
  const handleRailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) onCloseStyle();
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      titleValueRef.current = savedTitleRef.current;
      setTitleInput(savedTitleRef.current);
      event.currentTarget.blur();
    }
  };

  return (
    <div className="editor">
      {slots.title
        ? createPortal(
            <input
              className="title-input"
              value={titleInput}
              aria-label="Draft title"
              spellCheck={false}
              onChange={handleTitleChange}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
            />,
            slots.title,
          )
        : null}
      {slots.actions
        ? createPortal(
            <span className="save-notice" aria-live="polite">
              {saveNotice === "saved" ? "Saved" : ""}
            </span>,
            slots.actions,
          )
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
        <section className="program-sidebar" aria-label="Program">
          <div className="sidebar-head">
            <span className="micro-label">Program</span>
            <button
              type="button"
              className="btn btn-outline btn-compact"
              onClick={formatProgram}
              disabled={parseState === "error"}
            >
              Format
            </button>
          </div>
          <textarea
            className="program-editor"
            value={program}
            onChange={handleProgramChange}
            spellCheck={false}
            aria-label="Sequence program"
            aria-invalid={parseState === "error"}
            aria-describedby="program-status"
          />
          <div
            id="program-status"
            className={`program-status status-${parseState}`}
            aria-live="polite"
          >
            {parseState === "pending" ? (
              <p>Checking program…</p>
            ) : errors.length > 0 ? (
              <>
                <p className="status-title">
                  Fix the program to update the preview.
                </p>
                <ul>
                  {errors.map((error, index) => (
                    <li key={`${error.line}:${error.message}:${index}`}>
                      <strong>Line {error.line}:</strong> {error.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Program is valid.</p>
            )}
          </div>
        </section>

        <section className="editor-preview" aria-label="Preview">
          {errors.length > 0 ? (
            <span className="stale-pill">Showing last valid program</span>
          ) : null}
          <div className="editor-preview-scroll">
            <div className="editor-preview-content">
              <div className="diagram-card">
                <SequenceViewer document={doc} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
