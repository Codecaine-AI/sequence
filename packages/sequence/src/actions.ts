import type { SequenceAgentPatchOperation } from "./agent-schema";
import { parseSequenceProgram } from "./language";
import type { SequenceDocument } from "./schema";

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
      document = { ...document, style: { ...document.style, ...op.style } };
      continue;
    }

    document = { ...document, title: op.title };
  }

  return { ok: true, document };
}
