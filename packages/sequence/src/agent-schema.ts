import { Type, type Static, type TObject } from "@sinclair/typebox";
import { SequenceStyleSchema, type SequenceStyle } from "./schema";

export type SequenceAgentPatchOperation =
  | { type: "setProgram"; program: string }
  | { type: "setStyle"; style: Partial<SequenceStyle> }
  | { type: "setTitle"; title: string };

export const SetProgramParamsSchema = Type.Object({
  program: Type.String({
    description: "The complete sequence program. Always send the whole program, never a patch or partial fragment.",
  }),
}, { additionalProperties: false });

export const SetStyleParamsSchema = Type.Object({
  style: Type.Partial(SequenceStyleSchema, {
    description: "Visual styling to shallow-merge into the document. Styling never belongs in the sequence program.",
  }),
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
    description: "Shallow-merge visual style fields. Use this for styling; styling is deliberately absent from the sequence program.",
    params: SetStyleParamsSchema,
  },
  {
    type: "setTitle",
    description: "Set the document title without changing sequence structure or style.",
    params: SetTitleParamsSchema,
  },
];

type MutuallyAssignable<A, B> = A extends B ? (B extends A ? true : never) : never;
const _operationTypesMatch: MutuallyAssignable<
  Static<typeof SequenceAgentPatchOperationSchema>,
  SequenceAgentPatchOperation
> = true;
void _operationTypesMatch;
