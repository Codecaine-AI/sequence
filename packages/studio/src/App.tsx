import {
  SEQUENCE_THEME_DEFAULTS,
  SequenceViewer,
  applySequenceOperations,
  combinedFragments,
  loginFlow,
  minimal,
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
} from "react";
import {
  createDraft,
  deleteDraft,
  listDrafts,
  renameDraft,
  saveDraft,
  type StudioDraft,
} from "./draft-store";

type ProgramError = { line: number; message: string };
type FixtureKey = "login-flow" | "combined-fragments" | "minimal";
type StudioFixture = {
  key: FixtureKey;
  label: string;
  document: SequenceDocument;
};
type SelectionKey = `fixture:${FixtureKey}` | `draft:${string}`;

const STUDIO_FIXTURES: StudioFixture[] = [
  { key: "login-flow", label: "Login flow", document: loginFlow },
  {
    key: "combined-fragments",
    label: "Combined fragments",
    document: combinedFragments,
  },
  { key: "minimal", label: "Minimal", document: minimal },
];

const DEFAULT_STYLE: Required<SequenceStyle> = {
  accent: SEQUENCE_THEME_DEFAULTS.accent,
  fragmentAccent: SEQUENCE_THEME_DEFAULTS.fragmentAccent,
  participantFill: SEQUENCE_THEME_DEFAULTS.participantFill,
  scale: 1,
};

const INITIAL_FIXTURE = STUDIO_FIXTURES[0];

function draftSelection(id: string): SelectionKey {
  return `draft:${id}`;
}

function fixtureSelection(key: FixtureKey): SelectionKey {
  return `fixture:${key}`;
}

function cloneSequenceDocument(document: SequenceDocument): SequenceDocument {
  return JSON.parse(JSON.stringify(document)) as SequenceDocument;
}

function errorLine(message: string): number {
  const match = message.match(/(?:line\s+|^)(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function errorsFromOperation(messages: string[]): ProgramError[] {
  return messages.map((message) => ({ line: errorLine(message), message }));
}

function nextDraftId(drafts: StudioDraft[]): string {
  const used = new Set(
    drafts
      .map((draft) => draft.id.match(/^draft-(\d+)$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
  );
  let number = 1;
  while (used.has(number)) number += 1;
  return `draft-${number}`;
}

function validColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function App() {
  const initialDocumentRef = useRef(
    cloneSequenceDocument(INITIAL_FIXTURE.document),
  );
  const [document, setDocument] = useState<SequenceDocument>(
    initialDocumentRef.current,
  );
  const documentRef = useRef(document);
  const [program, setProgram] = useState(() =>
    serializeSequenceProgram(initialDocumentRef.current),
  );
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [parseState, setParseState] = useState<"valid" | "pending" | "error">(
    "valid",
  );
  const [drafts, setDrafts] = useState<StudioDraft[]>(listDrafts);
  const [selection, setSelection] = useState<SelectionKey>(() =>
    fixtureSelection(INITIAL_FIXTURE.key),
  );
  const selectionRef = useRef(selection);
  const [styleOpen, setStyleOpen] = useState(true);
  const [saveNotice, setSaveNotice] = useState<"idle" | "saved">("idle");
  const noticeTimerRef = useRef<number | null>(null);

  const refreshDrafts = useCallback(() => {
    setDrafts(listDrafts());
  }, []);

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

  const replaceDocument = useCallback(
    (nextDocument: SequenceDocument, persist = true) => {
      documentRef.current = nextDocument;
      setDocument(nextDocument);
      if (persist && selectionRef.current.startsWith("draft:")) {
        saveDraft(nextDocument);
        refreshDrafts();
        brieflyShowSaved();
      }
    },
    [brieflyShowSaved, refreshDrafts],
  );

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setParseState("pending");
    const timer = window.setTimeout(() => {
      const parsed = parseSequenceProgram(program);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        setParseState("error");
        return;
      }

      const applied = applySequenceOperations(documentRef.current, [
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

  const loadSelection = useCallback(
    (nextSelection: SelectionKey) => {
      let nextDocument: SequenceDocument | undefined;

      if (nextSelection.startsWith("fixture:")) {
        const key = nextSelection.slice("fixture:".length);
        const fixture = STUDIO_FIXTURES.find((candidate) => candidate.key === key);
        if (fixture) nextDocument = cloneSequenceDocument(fixture.document);
      } else {
        const id = nextSelection.slice("draft:".length);
        const draft = listDrafts().find((candidate) => candidate.id === id);
        if (draft) nextDocument = cloneSequenceDocument(draft.document);
      }

      if (!nextDocument) return;
      selectionRef.current = nextSelection;
      setSelection(nextSelection);
      replaceDocument(nextDocument, false);
      setProgram(serializeSequenceProgram(nextDocument));
      setErrors([]);
      setParseState("valid");
      setSaveNotice("idle");
    },
    [replaceDocument],
  );

  const handleSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    loadSelection(event.currentTarget.value as SelectionKey);
  };

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

  const createNewDraft = () => {
    const currentDrafts = listDrafts();
    const nextDocument = cloneSequenceDocument(
      STUDIO_FIXTURES.find((fixture) => fixture.key === "minimal")!.document,
    );
    nextDocument.id = nextDraftId(currentDrafts);
    const created = createDraft(nextDocument, "Untitled sequence");
    refreshDrafts();
    loadSelection(draftSelection(created.id));
  };

  const renameCurrentDraft = () => {
    if (!selection.startsWith("draft:")) return;
    const id = selection.slice("draft:".length);
    const current = drafts.find((draft) => draft.id === id);
    if (!current) return;
    const requested = window.prompt("Rename draft", current.title)?.trim();
    if (!requested || requested === current.title) return;
    renameDraft(id, requested);
    refreshDrafts();
  };

  const deleteCurrentDraft = () => {
    if (!selection.startsWith("draft:")) return;
    const id = selection.slice("draft:".length);
    const current = drafts.find((draft) => draft.id === id);
    if (!current || !window.confirm(`Delete "${current.title}"?`)) return;
    deleteDraft(id);
    refreshDrafts();
    loadSelection(fixtureSelection("minimal"));
  };

  const saveCurrentDraft = () => {
    if (!selection.startsWith("draft:")) return;
    saveDraft(documentRef.current);
    refreshDrafts();
    brieflyShowSaved();
  };

  const updateStyle = (style: Partial<SequenceStyle>) => {
    const applied = applySequenceOperations(documentRef.current, [
      { type: "setStyle", style },
    ]);
    if (applied.ok) replaceDocument(applied.document);
  };

  const selectedIsDraft = selection.startsWith("draft:");
  const accent = validColor(document.style.accent, DEFAULT_STYLE.accent);
  const fragmentAccent = validColor(
    document.style.fragmentAccent,
    DEFAULT_STYLE.fragmentAccent,
  );
  const participantFill = validColor(
    document.style.participantFill,
    DEFAULT_STYLE.participantFill,
  );
  const scale = document.style.scale ?? DEFAULT_STYLE.scale;

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            ↦
          </span>
          <div>
            <h1>Sequence Studio</h1>
            <p>Structure in the program. Presentation in style.</p>
          </div>
        </div>

        <div className="document-tools">
          <label className="document-picker">
            <span>Document</span>
            <select value={selection} onChange={handleSelectionChange}>
              <optgroup label="Examples">
                {STUDIO_FIXTURES.map((fixture) => (
                  <option
                    key={fixture.key}
                    value={fixtureSelection(fixture.key)}
                  >
                    {fixture.label}
                  </option>
                ))}
              </optgroup>
              {drafts.length > 0 ? (
                <optgroup label="Local drafts">
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draftSelection(draft.id)}>
                      {draft.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <button type="button" className="button primary" onClick={createNewDraft}>
            New draft
          </button>
          <button
            type="button"
            className="button"
            disabled={!selectedIsDraft}
            onClick={renameCurrentDraft}
          >
            Rename
          </button>
          <button
            type="button"
            className="button"
            disabled={!selectedIsDraft}
            onClick={saveCurrentDraft}
          >
            Save
          </button>
          <button
            type="button"
            className="button danger"
            disabled={!selectedIsDraft}
            onClick={deleteCurrentDraft}
          >
            Delete
          </button>
          <span className="save-notice" aria-live="polite">
            {saveNotice === "saved" ? "Saved locally" : ""}
          </span>
        </div>
      </header>

      <div className={`workspace ${styleOpen ? "style-is-open" : ""}`}>
        <section className="panel editor-panel" aria-labelledby="program-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Agent projection</p>
              <h2 id="program-heading">Program</h2>
            </div>
            <button
              type="button"
              className="button compact"
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
                <p className="status-title">Fix the program to update the preview.</p>
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

        <section className="panel preview-panel" aria-labelledby="preview-heading">
          <div className="panel-heading preview-heading">
            <div>
              <p className="eyebrow">Deterministic SVG</p>
              <h2 id="preview-heading">Preview</h2>
            </div>
            <span
              className={`preview-badge ${errors.length > 0 ? "is-stale" : ""}`}
            >
              {errors.length > 0 ? "Showing last valid" : "Live"}
            </span>
          </div>
          <div className="preview-canvas">
            <SequenceViewer document={document} />
          </div>
        </section>

        <aside className={`style-panel ${styleOpen ? "is-open" : ""}`}>
          <button
            type="button"
            className="style-toggle"
            aria-expanded={styleOpen}
            aria-controls="style-controls"
            onClick={() => setStyleOpen((open) => !open)}
          >
            <span aria-hidden="true">{styleOpen ? "›" : "‹"}</span>
            <span>{styleOpen ? "Hide style" : "Style"}</span>
          </button>
          {styleOpen ? (
            <div id="style-controls" className="style-controls">
              <div className="style-heading">
                <p className="eyebrow">Document style</p>
                <h2>Appearance</h2>
                <p>These values stay outside the sequence program.</p>
              </div>
              <label className="color-control">
                <span>Accent</span>
                <span className="color-value">{accent}</span>
                <input
                  type="color"
                  value={accent}
                  onChange={(event) => updateStyle({ accent: event.currentTarget.value })}
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
                <span>
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
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
