import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export type ParticipantKind = "actor" | "participant";

export interface SequenceParticipant {
  id: string;
  name: string;
  kind: ParticipantKind;
  label?: string;
  stereotype?: string;
}

export type MessageLine = "sync" | "async" | "return";

export interface SequenceMessage {
  kind: "message";
  id: string;
  from: string;
  to: string;
  line: MessageLine;
  text: string;
}

export type FragmentOp = "alt" | "opt" | "loop";

export interface SequenceOperand {
  guard?: string;
  items: SequenceItem[];
}

export interface SequenceFragment {
  kind: "fragment";
  id: string;
  op: FragmentOp;
  operands: SequenceOperand[];
}

export type NoteSide = "left" | "right" | "over";

export interface SequenceNote {
  kind: "note";
  id: string;
  anchor: string;
  side: NoteSide;
  text: string;
}

export type SequenceItem = SequenceMessage | SequenceFragment | SequenceNote;

export interface SequenceStyle {
  accent?: string;
  fragmentAccent?: string;
  participantFill?: string;
  scale?: number;
}

export interface SequenceDocument {
  version: 1;
  id: string;
  title?: string;
  participants: SequenceParticipant[];
  items: SequenceItem[];
  style: SequenceStyle;
}

export const ParticipantKindSchema = Type.Union([
  Type.Literal("actor"),
  Type.Literal("participant"),
]);

export const SequenceParticipantSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  kind: ParticipantKindSchema,
  label: Type.Optional(Type.String()),
  stereotype: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const MessageLineSchema = Type.Union([
  Type.Literal("sync"),
  Type.Literal("async"),
  Type.Literal("return"),
]);

export const FragmentOpSchema = Type.Union([
  Type.Literal("alt"),
  Type.Literal("opt"),
  Type.Literal("loop"),
]);

export const NoteSideSchema = Type.Union([
  Type.Literal("left"),
  Type.Literal("right"),
  Type.Literal("over"),
]);

export const SequenceMessageSchema = Type.Object({
  kind: Type.Literal("message"),
  id: Type.String(),
  from: Type.String(),
  to: Type.String(),
  line: MessageLineSchema,
  text: Type.String(),
}, { additionalProperties: false });

export const SequenceNoteSchema = Type.Object({
  kind: Type.Literal("note"),
  id: Type.String(),
  anchor: Type.String(),
  side: NoteSideSchema,
  text: Type.String(),
}, { additionalProperties: false });

export const SequenceItemSchema = Type.Recursive((This) => Type.Union([
  SequenceMessageSchema,
  Type.Object({
    kind: Type.Literal("fragment"),
    id: Type.String(),
    op: FragmentOpSchema,
    operands: Type.Array(Type.Object({
      guard: Type.Optional(Type.String()),
      items: Type.Array(This),
    }, { additionalProperties: false }), { minItems: 1 }),
  }, { additionalProperties: false }),
  SequenceNoteSchema,
]), { $id: "SequenceItem" });

export const SequenceOperandSchema = Type.Object({
  guard: Type.Optional(Type.String()),
  items: Type.Array(SequenceItemSchema),
}, { additionalProperties: false });

export const SequenceFragmentSchema = Type.Object({
  kind: Type.Literal("fragment"),
  id: Type.String(),
  op: FragmentOpSchema,
  operands: Type.Array(SequenceOperandSchema, { minItems: 1 }),
}, { additionalProperties: false });

export const SequenceStyleSchema = Type.Object({
  accent: Type.Optional(Type.String()),
  fragmentAccent: Type.Optional(Type.String()),
  participantFill: Type.Optional(Type.String()),
  scale: Type.Optional(Type.Number()),
}, { additionalProperties: false });

export const SequenceDocumentSchema = Type.Object({
  version: Type.Literal(1),
  id: Type.String(),
  title: Type.Optional(Type.String()),
  participants: Type.Array(SequenceParticipantSchema),
  items: Type.Array(SequenceItemSchema),
  style: SequenceStyleSchema,
}, { additionalProperties: false });

type MutuallyAssignable<A, B> = A extends B ? (B extends A ? true : never) : never;
const _documentTypesMatch: MutuallyAssignable<Static<typeof SequenceDocumentSchema>, SequenceDocument> = true;
void _documentTypesMatch;

export function validateSequenceDocument(value: unknown): { ok: boolean; errors: string[] } {
  const errors = [...Value.Errors(SequenceDocumentSchema, value)].map((error) => {
    const path = error.path || "/";
    return `${path}: ${error.message}`;
  });
  if (errors.length === 0) {
    const document = value as SequenceDocument;
    const participantIds = new Set<string>();
    document.participants.forEach((participant, index) => {
      if (participantIds.has(participant.id)) {
        errors.push(`/participants/${index}/id: participant id ${JSON.stringify(participant.id)} is duplicated`);
      }
      participantIds.add(participant.id);
    });

    const itemIds = new Set<string>();
    const visitItems = (items: SequenceItem[], path: string): void => {
      items.forEach((item, index) => {
        const itemPath = `${path}/${index}`;
        if (itemIds.has(item.id)) {
          errors.push(`${itemPath}/id: item id ${JSON.stringify(item.id)} is duplicated`);
        }
        itemIds.add(item.id);
        if (item.kind === "message") {
          if (!participantIds.has(item.from)) {
            errors.push(`${itemPath}/from: unknown participant id ${JSON.stringify(item.from)}`);
          }
          if (!participantIds.has(item.to)) {
            errors.push(`${itemPath}/to: unknown participant id ${JSON.stringify(item.to)}`);
          }
          return;
        }
        if (item.kind === "note") {
          if (!participantIds.has(item.anchor)) {
            errors.push(`${itemPath}/anchor: unknown participant id ${JSON.stringify(item.anchor)}`);
          }
          return;
        }
        if (item.op !== "alt" && item.operands.length !== 1) {
          errors.push(`${itemPath}/operands: ${item.op} fragments require exactly one operand`);
        }
        if (item.operands[0]?.guard === undefined) {
          errors.push(`${itemPath}/operands/0/guard: the first fragment operand requires a guard`);
        }
        item.operands.forEach((operand, operandIndex) => {
          visitItems(operand.items, `${itemPath}/operands/${operandIndex}/items`);
        });
      });
    };
    visitItems(document.items, "/items");
  }
  return { ok: errors.length === 0, errors };
}

export function assertSequenceDocument(value: unknown): asserts value is SequenceDocument {
  const result = validateSequenceDocument(value);
  if (!result.ok) {
    throw new TypeError(`Invalid SequenceDocument:\n${result.errors.join("\n")}`);
  }
}
