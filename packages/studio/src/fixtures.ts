import {
  combinedFragments,
  loginFlow,
  minimal,
  type SequenceDocument,
} from "@codecaine-ai/sequence";
import type { StudioDraft } from "./draft-store";

export type FixtureKey = "login-flow" | "combined-fragments" | "minimal";

export type StudioFixture = {
  key: FixtureKey;
  label: string;
  document: SequenceDocument;
};

const minimalFixture: StudioFixture = {
  key: "minimal",
  label: "Minimal",
  document: minimal,
};

/** Pristine engine examples: opening one always seeds a new draft copy. */
export const STUDIO_FIXTURES: StudioFixture[] = [
  { key: "login-flow", label: "Login flow", document: loginFlow },
  {
    key: "combined-fragments",
    label: "Combined fragments",
    document: combinedFragments,
  },
  minimalFixture,
];

export const MINIMAL_FIXTURE = minimalFixture;

export function cloneSequenceDocument(
  document: SequenceDocument,
): SequenceDocument {
  return JSON.parse(JSON.stringify(document)) as SequenceDocument;
}

/** Lowest unused `draft-N` id, matching the store's historical id scheme. */
export function nextDraftId(drafts: StudioDraft[]): string {
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
