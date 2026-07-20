import { Type, type Static, type TObject } from "@sinclair/typebox";

/**
 * setStyle payloads are PATCHES, not documents: every field may also be
 * `null`, which clears that field (or a whole element group) from the
 * stored style. Omitted fields are always preserved. Element groups merge
 * one level deep — sending `{ participant: { fill: "#fff" } }` keeps any
 * other participant fields already set.
 */
export interface SequenceSurfaceStylePatch {
  background?: string | null;
  margin?: number | null;
  columnGap?: number | null;
  rowGap?: number | null;
}

export interface SequenceParticipantStylePatch {
  fill?: string | null;
  stroke?: string | null;
  text?: string | null;
  padding?: number | null;
  cornerRadius?: number | null;
  opacity?: number | null;
}

export interface SequenceLifelineStylePatch {
  stroke?: string | null;
  dash?: number | null;
  opacity?: number | null;
}

export interface SequenceMessageStylePatch {
  stroke?: string | null;
  text?: string | null;
  labelGap?: number | null;
  opacity?: number | null;
}

export interface SequenceActivationStylePatch {
  fill?: string | null;
  stroke?: string | null;
  width?: number | null;
  opacity?: number | null;
}

export interface SequenceFragmentStylePatch {
  stroke?: string | null;
  labelFill?: string | null;
  labelText?: string | null;
  bodyOpacity?: number | null;
  padding?: number | null;
}

export interface SequenceNoteStylePatch {
  fill?: string | null;
  stroke?: string | null;
  text?: string | null;
  padding?: number | null;
  opacity?: number | null;
}

export interface SequenceStylePatch {
  accent?: string | null;
  fragmentAccent?: string | null;
  participantFill?: string | null;
  scale?: number | null;
  surface?: SequenceSurfaceStylePatch | null;
  participant?: SequenceParticipantStylePatch | null;
  lifeline?: SequenceLifelineStylePatch | null;
  message?: SequenceMessageStylePatch | null;
  activation?: SequenceActivationStylePatch | null;
  fragment?: SequenceFragmentStylePatch | null;
  note?: SequenceNoteStylePatch | null;
}

export type SequenceAgentPatchOperation =
  | { type: "setProgram"; program: string }
  | { type: "setStyle"; style: SequenceStylePatch }
  | { type: "setTitle"; title: string };

const NullableString = () => Type.Optional(Type.Union([Type.String(), Type.Null()]));
const NullableNumber = () => Type.Optional(Type.Union([Type.Number(), Type.Null()]));
const nullableGroup = <T extends TObject>(schema: T) =>
  Type.Optional(Type.Union([schema, Type.Null()]));

export const SequenceSurfaceStylePatchSchema = Type.Object({
  background: NullableString(),
  margin: NullableNumber(),
  columnGap: NullableNumber(),
  rowGap: NullableNumber(),
}, { additionalProperties: false });

export const SequenceParticipantStylePatchSchema = Type.Object({
  fill: NullableString(),
  stroke: NullableString(),
  text: NullableString(),
  padding: NullableNumber(),
  cornerRadius: NullableNumber(),
  opacity: NullableNumber(),
}, { additionalProperties: false });

export const SequenceLifelineStylePatchSchema = Type.Object({
  stroke: NullableString(),
  dash: NullableNumber(),
  opacity: NullableNumber(),
}, { additionalProperties: false });

export const SequenceMessageStylePatchSchema = Type.Object({
  stroke: NullableString(),
  text: NullableString(),
  labelGap: NullableNumber(),
  opacity: NullableNumber(),
}, { additionalProperties: false });

export const SequenceActivationStylePatchSchema = Type.Object({
  fill: NullableString(),
  stroke: NullableString(),
  width: NullableNumber(),
  opacity: NullableNumber(),
}, { additionalProperties: false });

export const SequenceFragmentStylePatchSchema = Type.Object({
  stroke: NullableString(),
  labelFill: NullableString(),
  labelText: NullableString(),
  bodyOpacity: NullableNumber(),
  padding: NullableNumber(),
}, { additionalProperties: false });

export const SequenceNoteStylePatchSchema = Type.Object({
  fill: NullableString(),
  stroke: NullableString(),
  text: NullableString(),
  padding: NullableNumber(),
  opacity: NullableNumber(),
}, { additionalProperties: false });

export const SequenceStylePatchSchema = Type.Object({
  accent: NullableString(),
  fragmentAccent: NullableString(),
  participantFill: NullableString(),
  scale: NullableNumber(),
  surface: nullableGroup(SequenceSurfaceStylePatchSchema),
  participant: nullableGroup(SequenceParticipantStylePatchSchema),
  lifeline: nullableGroup(SequenceLifelineStylePatchSchema),
  message: nullableGroup(SequenceMessageStylePatchSchema),
  activation: nullableGroup(SequenceActivationStylePatchSchema),
  fragment: nullableGroup(SequenceFragmentStylePatchSchema),
  note: nullableGroup(SequenceNoteStylePatchSchema),
}, {
  additionalProperties: false,
  description: "Style patch deep-merged one level into the document style. Element groups (surface, participant, lifeline, message, activation, fragment, note) merge per-field; the shortcut fields (accent, fragmentAccent, participantFill, scale) merge as before. null clears a field or a whole group; omitted fields are preserved.",
});

type MutuallyAssignable<A, B> = A extends B ? (B extends A ? true : never) : never;
const _stylePatchTypesMatch: MutuallyAssignable<
  Static<typeof SequenceStylePatchSchema>,
  SequenceStylePatch
> = true;
void _stylePatchTypesMatch;

export const SetProgramParamsSchema = Type.Object({
  program: Type.String({
    description: "The complete sequence program. Always send the whole program, never a patch or partial fragment.",
  }),
}, { additionalProperties: false });

export const SetStyleParamsSchema = Type.Object({
  style: SequenceStylePatchSchema,
}, { additionalProperties: false });

export const SetTitleParamsSchema = Type.Object({
  title: Type.String({ description: "The document title." }),
}, { additionalProperties: false });

export const SetProgramOperationSchema = Type.Object({
  type: Type.Literal("setProgram"),
  ...SetProgramParamsSchema.properties,
}, { additionalProperties: false });

export const SetStyleOperationSchema = Type.Object({
  type: Type.Literal("setStyle"),
  ...SetStyleParamsSchema.properties,
}, { additionalProperties: false });

export const SetTitleOperationSchema = Type.Object({
  type: Type.Literal("setTitle"),
  ...SetTitleParamsSchema.properties,
}, { additionalProperties: false });

export const SequenceAgentPatchOperationSchema = Type.Union([
  SetProgramOperationSchema,
  SetStyleOperationSchema,
  SetTitleOperationSchema,
]);

export const SEQUENCE_AGENT_PATCH_OPERATIONS: {
  type: string;
  description: string;
  params: TObject;
}[] = [
  {
    type: "setProgram",
    description: "Replace sequence structure using a complete whole-program rewrite. Send every participant and item; do not send patches. Styling is set separately with setStyle and must never appear in the program.",
    params: SetProgramParamsSchema,
  },
  {
    type: "setStyle",
    description: "Deep-merge visual style fields one level: element groups (surface, participant, lifeline, message, activation, fragment, note) merge per-field, shortcuts merge as before, and null clears a field or group. Omitted fields are preserved. Use this for styling; styling is deliberately absent from the sequence program.",
    params: SetStyleParamsSchema,
  },
  {
    type: "setTitle",
    description: "Set the document title without changing sequence structure or style.",
    params: SetTitleParamsSchema,
  },
];

const _operationTypesMatch: MutuallyAssignable<
  Static<typeof SequenceAgentPatchOperationSchema>,
  SequenceAgentPatchOperation
> = true;
void _operationTypesMatch;
