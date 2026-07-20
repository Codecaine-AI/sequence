import {
  SEQUENCE_THEME_DEFAULTS,
  SequenceViewer,
  applySequenceOperations,
  parseSequenceProgram,
  serializeSequenceProgram,
  type SequenceDocument,
  type SequenceStyle,
} from "@codecaine-ai/sequence";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  listDrafts,
  renameDraft,
  saveDraft,
  type StudioDraft,
} from "./draft-store";
import { cloneSequenceDocument } from "./fixtures";

type ProgramError = { line: number; message: string };

const STYLE_OPEN_KEY = "sequence-studio.showStyle";

const DEFAULT_STYLE: Required<SequenceStyle> = {
  accent: SEQUENCE_THEME_DEFAULTS.accent,
  fragmentAccent: SEQUENCE_THEME_DEFAULTS.fragmentAccent,
  participantFill: SEQUENCE_THEME_DEFAULTS.participantFill,
  scale: 1,
};

function errorLine(message: string): number {
  const match = message.match(/(?:line\s+|^)(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function errorsFromOperation(messages: string[]): ProgramError[] {
  return messages.map((message) => ({ line: errorLine(message), message }));
}

function validColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function readStyleOpenPreference(): boolean {
  try {
    return window.localStorage.getItem(STYLE_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

type EditorPageProps = {
  draftId: string;
  onBack: () => void;
};

export function EditorPage({ draftId, onBack }: EditorPageProps) {
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

  return <DraftEditor draft={initialDraft} onBack={onBack} />;
}

function DraftEditor({
  draft,
  onBack,
}: {
  draft: StudioDraft;
  onBack: () => void;
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
  const [styleOpen, setStyleOpen] = useState(readStyleOpenPreference);
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

  useEffect(() => {
    try {
      window.localStorage.setItem(STYLE_OPEN_KEY, String(styleOpen));
    } catch {
      // A blocked localStorage should not break the toggle for this session.
    }
  }, [styleOpen]);

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
  const updateStyle = (style: Partial<SequenceStyle>) => {
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

  const accent = validColor(doc.style.accent, DEFAULT_STYLE.accent);
  const fragmentAccent = validColor(
    doc.style.fragmentAccent,
    DEFAULT_STYLE.fragmentAccent,
  );
  const participantFill = validColor(
    doc.style.participantFill,
    DEFAULT_STYLE.participantFill,
  );
  const scale = doc.style.scale ?? DEFAULT_STYLE.scale;

  return (
    <div className="editor">
      <header className="editor-topbar">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Back to gallery"
          title="Back to gallery"
          onClick={onBack}
        >
          ←
        </button>
        <input
          className="title-input"
          value={titleInput}
          aria-label="Draft title"
          spellCheck={false}
          onChange={handleTitleChange}
          onBlur={commitTitle}
          onKeyDown={handleTitleKeyDown}
        />
        <div className="topbar-actions">
          <span className="save-notice" aria-live="polite">
            {saveNotice === "saved" ? "Saved" : ""}
          </span>
          <button
            type="button"
            className={styleOpen ? "btn btn-primary" : "btn btn-outline"}
            aria-pressed={styleOpen}
            title="Toggle the style sidebar"
            onClick={() => setStyleOpen((open) => !open)}
          >
            Style
          </button>
        </div>
      </header>

      <div className="editor-body">
        <aside className="program-sidebar" aria-label="Program">
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
        </aside>

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

        {styleOpen ? (
          <aside className="style-sidebar" aria-label="Style">
            <div className="style-head">
              <span className="micro-label">Document style</span>
              <h2>Style</h2>
              <p>Style never changes the program text.</p>
            </div>
            <label className="color-control">
              <span>Accent</span>
              <span className="color-value">{accent}</span>
              <input
                type="color"
                value={accent}
                onChange={(event) =>
                  updateStyle({ accent: event.currentTarget.value })
                }
              />
            </label>
            <label className="color-control">
              <span>Fragment accent</span>
              <span className="color-value">{fragmentAccent}</span>
              <input
                type="color"
                value={fragmentAccent}
                onChange={(event) =>
                  updateStyle({ fragmentAccent: event.currentTarget.value })
                }
              />
            </label>
            <label className="color-control">
              <span>Participant fill</span>
              <span className="color-value">{participantFill}</span>
              <input
                type="color"
                value={participantFill}
                onChange={(event) =>
                  updateStyle({ participantFill: event.currentTarget.value })
                }
              />
            </label>
            <label className="scale-control">
              <span className="scale-label">
                Scale <strong>{scale.toFixed(2)}×</strong>
              </span>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.05"
                value={scale}
                onChange={(event) =>
                  updateStyle({ scale: Number(event.currentTarget.value) })
                }
              />
            </label>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
