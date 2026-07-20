import type { SequenceDocument } from "@codecaine-ai/sequence";

/**
 * Studio persistence is deliberately local-only. Each entry contains a full
 * sequence document and is keyed by that document's stable id.
 */
const STORAGE_KEY = "sequence-studio-drafts";

export type StudioDraft = {
  id: string;
  title: string;
  updatedAt: string;
  document: SequenceDocument;
};

type DraftMap = Record<string, StudioDraft>;

function cloneDocument(document: SequenceDocument): SequenceDocument {
  return JSON.parse(JSON.stringify(document)) as SequenceDocument;
}

function cloneDraft(draft: StudioDraft): StudioDraft {
  return {
    ...draft,
    document: cloneDocument(draft.document),
  };
}

function isStoredDraft(value: unknown): value is StudioDraft {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<StudioDraft>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.updatedAt === "string" &&
    !!candidate.document &&
    typeof candidate.document === "object"
  );
}

function readDrafts(): DraftMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const drafts: DraftMap = {};
    for (const value of Object.values(parsed)) {
      if (isStoredDraft(value)) drafts[value.id] = value;
    }
    return drafts;
  } catch {
    return {};
  }
}

function writeDrafts(drafts: DraftMap): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // A blocked or full localStorage should not make the studio unusable.
  }
}

function draftTitle(
  document: SequenceDocument,
  requestedTitle?: string,
  existingTitle?: string,
): string {
  return requestedTitle ?? existingTitle ?? document.title ?? document.id;
}

export function listDrafts(): StudioDraft[] {
  return Object.values(readDrafts())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(cloneDraft);
}

export function createDraft(
  document: SequenceDocument,
  title?: string,
): StudioDraft {
  const drafts = readDrafts();
  const draft: StudioDraft = {
    id: document.id,
    title: draftTitle(document, title),
    updatedAt: new Date().toISOString(),
    document: cloneDocument(document),
  };

  drafts[draft.id] = draft;
  writeDrafts(drafts);
  return cloneDraft(draft);
}

export function renameDraft(id: string, title: string): StudioDraft | undefined {
  const drafts = readDrafts();
  const existing = drafts[id];
  if (!existing) return undefined;

  const renamed: StudioDraft = {
    ...existing,
    title,
    updatedAt: new Date().toISOString(),
  };
  drafts[id] = renamed;
  writeDrafts(drafts);
  return cloneDraft(renamed);
}

export function saveDraft(
  document: SequenceDocument,
  title?: string,
): StudioDraft {
  const drafts = readDrafts();
  const draft: StudioDraft = {
    id: document.id,
    title: draftTitle(document, title, drafts[document.id]?.title),
    updatedAt: new Date().toISOString(),
    document: cloneDocument(document),
  };

  drafts[draft.id] = draft;
  writeDrafts(drafts);
  return cloneDraft(draft);
}

export function deleteDraft(id: string): void {
  const drafts = readDrafts();
  delete drafts[id];
  writeDrafts(drafts);
}
