import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/** The nine judged categories, in table order: three for meaning, six for look. */
export const SCORE_CATEGORIES = [
  "systemFidelity",
  "requirementCoverage",
  "scopeDiscipline",
  "readability",
  "participantOrder",
  "rhythmAndFragments",
  "colorAndContrast",
  "typographyAndLabels",
  "craft",
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

const Score = Type.Integer({ minimum: 1, maximum: 10 });

export const ScoresSchema = Type.Object(
  {
    systemFidelity: Score,
    requirementCoverage: Score,
    scopeDiscipline: Score,
    readability: Score,
    participantOrder: Score,
    rhythmAndFragments: Score,
    colorAndContrast: Score,
    typographyAndLabels: Score,
    craft: Score,
  },
  { additionalProperties: false },
);

export const FindingSchema = Type.Object(
  {
    category: Type.Union(SCORE_CATEGORIES.map((category) => Type.Literal(category))),
    severity: Type.Union([Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")]),
    text: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

/** One judge's verdict on one brief: `<scores>/<judge>/<brief>.json`. */
export const JudgeScoreSchema = Type.Object(
  {
    judge: Type.String({ minLength: 1 }),
    brief: Type.String({ minLength: 1 }),
    scores: ScoresSchema,
    findings: Type.Array(FindingSchema),
  },
  { additionalProperties: false },
);

export type JudgeScore = Static<typeof JudgeScoreSchema>;
export type Finding = Static<typeof FindingSchema>;

// The category list and the schema's keys must stay the same set.
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _categoriesMatch: SameKeys<ScoreCategory, keyof Static<typeof ScoresSchema>> = true;
void _categoriesMatch;

export type ParseJudgeScoreResult =
  | { ok: true; score: JudgeScore }
  | { ok: false; errors: string[] };

/** Validate a parsed score file. */
export function parseJudgeScore(value: unknown): ParseJudgeScoreResult {
  if (Value.Check(JudgeScoreSchema, value)) return { ok: true, score: value };
  const errors = [...Value.Errors(JudgeScoreSchema, value)].map((error) => `${error.path || "/"}: ${error.message}`);
  return { ok: false, errors };
}
