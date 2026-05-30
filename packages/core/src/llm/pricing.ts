/** USD per 1M tokens — hardcoded Anthropic pricing for cost tracking */
export const HAIKU_INPUT_USD_PER_M = 0.25;
export const HAIKU_OUTPUT_USD_PER_M = 1.25;
export const SONNET_INPUT_USD_PER_M = 3.0;
export const SONNET_OUTPUT_USD_PER_M = 15.0;

export function estimateAnthropicCost(
  inputTokens: number,
  outputTokens: number,
  tier: 'haiku' | 'sonnet'
): number {
  if (tier === 'haiku') {
    return (
      (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
      (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M
    );
  }
  return (
    (inputTokens / 1_000_000) * SONNET_INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * SONNET_OUTPUT_USD_PER_M
  );
}

/** Ollama local mode is treated as zero marginal cost */
export function estimateOllamaCost(): number {
  return 0;
}
