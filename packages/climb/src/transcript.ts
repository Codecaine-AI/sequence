import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/** Token totals of one drawer run. */
export interface TokenTotals {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
}

export interface TranscriptMetrics {
  /** Every tool call the drawer made, counted once per tool_use id. */
  toolCalls: { total: number; byName: Record<string, number> };
  tokens: TokenTotals;
  /** From the final result event; undefined when the run ended without one. */
  result: { isError: boolean; numTurns: number; durationMs: number; costUsd: number | undefined; subtype: string } | undefined;
}

// Only the fields metrics read; every other field of a stream-json event passes.
const Usage = Type.Object({
  input_tokens: Type.Optional(Type.Number()),
  output_tokens: Type.Optional(Type.Number()),
  cache_creation_input_tokens: Type.Optional(Type.Number()),
  cache_read_input_tokens: Type.Optional(Type.Number()),
});
const AssistantEvent = Type.Object({
  type: Type.Literal("assistant"),
  message: Type.Object({
    id: Type.Optional(Type.String()),
    content: Type.Array(Type.Object({ type: Type.String(), id: Type.Optional(Type.String()), name: Type.Optional(Type.String()) })),
    usage: Type.Optional(Usage),
  }),
});
const ResultEvent = Type.Object({
  type: Type.Literal("result"),
  subtype: Type.String(),
  is_error: Type.Boolean(),
  num_turns: Type.Number(),
  duration_ms: Type.Number(),
  total_cost_usd: Type.Optional(Type.Number()),
  usage: Usage,
});

type UsageValue = Static<typeof Usage>;

function totals(usage: UsageValue): TokenTotals {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return { input, output, cacheCreation, cacheRead, total: input + output + cacheCreation + cacheRead };
}

function sum(values: TokenTotals[]): TokenTotals {
  return values.reduce(
    (acc, value) => ({
      input: acc.input + value.input,
      output: acc.output + value.output,
      cacheCreation: acc.cacheCreation + value.cacheCreation,
      cacheRead: acc.cacheRead + value.cacheRead,
      total: acc.total + value.total,
    }),
    { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 },
  );
}

/**
 * Metrics from a `claude -p --output-format stream-json --verbose` transcript.
 * Tokens come from the final result event; without one, from the last usage
 * of each assistant message id.
 */
export function transcriptMetrics(jsonl: string): TranscriptMetrics {
  const toolIds = new Set<string>();
  const byName: Record<string, number> = {};
  const messageUsage = new Map<string, TokenTotals>();
  let result: TranscriptMetrics["result"];
  let resultTokens: TokenTotals | undefined;
  let anonymous = 0;

  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (Value.Check(AssistantEvent, event)) {
      for (const block of event.message.content) {
        if (block.type !== "tool_use") continue;
        const id = block.id ?? `anonymous-${anonymous++}`;
        if (toolIds.has(id)) continue;
        toolIds.add(id);
        const name = block.name ?? "unknown";
        byName[name] = (byName[name] ?? 0) + 1;
      }
      if (event.message.usage) messageUsage.set(event.message.id ?? `anonymous-${anonymous++}`, totals(event.message.usage));
    } else if (Value.Check(ResultEvent, event)) {
      result = {
        isError: event.is_error,
        numTurns: event.num_turns,
        durationMs: event.duration_ms,
        costUsd: event.total_cost_usd,
        subtype: event.subtype,
      };
      resultTokens = totals(event.usage);
    }
  }
  return {
    toolCalls: { total: toolIds.size, byName },
    tokens: resultTokens ?? sum([...messageUsage.values()]),
    result,
  };
}
