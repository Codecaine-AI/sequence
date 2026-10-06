import type { SequenceStylePatch } from "@codecaine-ai/sequence";

export type PatchSequenceStyle = (patch: SequenceStylePatch) => void;

export type RailTab = "colors" | "layout";
