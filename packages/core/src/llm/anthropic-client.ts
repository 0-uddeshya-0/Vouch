import { ANTHROPIC_FINDINGS_TOOL, parseLLMFindingsPayload } from './findings-schema';
import type { LLMClient, LLMClientResponse } from './types';

export interface AnthropicClientOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT = `You are Vouch, an automated PR security reviewer.
Analyze the unified diff for logical security flaws missed by static analysis (SQL injection, unsafe eval, path traversal, auth bypass).
Return findings ONLY via the report_findings tool. Be conservative — only flag real risks with evidence from the diff.`;

export class AnthropicClient implements LLMClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AnthropicClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async analyzeDiff(
    diffText: string,
    deterministicSummary: string,
    options?: { snippet?: string; deep?: boolean }
  ): Promise<LLMClientResponse> {
    const userContent = options?.snippet
      ? `Deep analysis requested for this snippet:\n\`\`\`\n${options.snippet}\n\`\`\`\n\nPrior context:\n${deterministicSummary}`
      : `Deterministic findings already detected:\n${deterministicSummary || 'None'}\n\nPull request diff:\n\`\`\`diff\n${diffText}\n\`\`\``;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 30_000
    );

    try {
      const response = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: options?.deep ? 2048 : 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
          tools: [ANTHROPIC_FINDINGS_TOOL],
          tool_choice: { type: 'tool', name: 'report_findings' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        usage?: { input_tokens?: number; output_tokens?: number };
        content?: Array<{ type: string; input?: unknown; name?: string }>;
      };

      const toolBlock = data.content?.find(
        (block) => block.type === 'tool_use' && block.name === 'report_findings'
      );

      return {
        findings: parseLLMFindingsPayload(toolBlock?.input ?? { findings: [] }),
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
