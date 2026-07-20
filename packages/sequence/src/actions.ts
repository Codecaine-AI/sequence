import type { SequenceAgentPatchOperation, SequenceStylePatch } from "./agent-schema";
import { parseSequenceProgram } from "./language";
import type { SequenceDocument, SequenceStyle } from "./schema";

const STYLE_GROUP_KEYS = [
  "surface",
  "participant",
  "lifeline",
  "message",
  "activation",
  "fragment",
  "note",
] as const;

type StyleGroupKey = (typeof STYLE_GROUP_KEYS)[number];

function isStyleGroupKey(key: string): key is StyleGroupKey {
  return (STYLE_GROUP_KEYS as readonly string[]).includes(key);
}

/**
 * Deep-merge a style patch one level into a style. Shortcut fields
 * (accent, fragmentAccent, participantFill, scale) replace as before;
 * element groups merge per-field. `null` clears a field or a whole group;
 * omitted fields are preserved. Groups left empty by clears are dropped.
 */
export function mergeSequenceStyle(
  base: SequenceStyle,
  patch: SequenceStylePatch,
): SequenceStyle {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      delete next[key];
      continue;
    }
    if (isStyleGroupKey(key) && typeof value === "object") {
      const merged: Record<string, unknown> = {
        ...((base as Record<string, unknown>)[key] as Record<string, unknown> | undefined),
      };
      for (const [field, fieldValue] of Object.entries(value)) {
        if (fieldValue === undefined) continue;
        if (fieldValue === null) delete merged[field];
        else merged[field] = fieldValue;
      }
      if (Object.keys(merged).length === 0) delete next[key];
      else next[key] = merged;
      continue;
    }
    next[key] = value;
  }
  return next as SequenceStyle;
}

export function applySequenceOperations(
  doc: SequenceDocument,
  ops: SequenceAgentPatchOperation[],
): { ok: true; document: SequenceDocument } | { ok: false; errors: string[] } {
  let document: SequenceDocument = doc;

  for (const op of ops) {
    if (op.type === "setProgram") {
      const parsed = parseSequenceProgram(op.program);
      if (!parsed.ok) {
        return {
          ok: false,
          errors: parsed.errors.map((error) => `Line ${error.line}: ${error.message}`),
        };
      }
      document = {
        ...document,
        ...(parsed.document.title === undefined ? {} : { title: parsed.document.title }),
        participants: parsed.document.participants,
        items: parsed.document.items,
        style: document.style,
        id: document.id,
      };
      continue;
    }

    if (op.type === "setStyle") {
      document = { ...document, style: mergeSequenceStyle(document.style, op.style) };
      continue;
    }

    document = { ...document, title: op.title };
  }

  return { ok: true, document };
}
