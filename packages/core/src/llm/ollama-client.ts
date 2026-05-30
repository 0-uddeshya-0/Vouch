import { parseLLMFindingsPayload } from './findings-schema';
import type { LLMClient, LLMClientResponse } from './types';

export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT = `You are Vouch, an automated PR security reviewer.
Analyze diffs for security flaws. Respond with JSON only:
{"findings":[{"type":"security","severity":"high","confidence":0.8,"filePath":"path","lineStart":1,"lineEnd":1,"title":"...","description":"...","codeSnippet":"...","needs_escalation":false}]}`;

export class OllamaClient implements LLMClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OllamaClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async analyzeDiff(
    diffText: string,
    deterministicSummary: string,
    options?: { snippet?: string; deep?: boolean }
  ): Promise<LLMClientResponse> {
    const userContent = options?.snippet
      ? `Deep analysis snippet:\n${options.snippet}\n\nContext:\n${deterministicSummary}`
      : `Deterministic findings:\n${deterministicSummary || 'None'}\n\nDiff:\n${diffText}`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 60_000
    );

    try {
      const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      let payload: unknown = { findings: [] };
      if (data.message?.content) {
        try {
          payload = JSON.parse(data.message.content);
        } catch {
          payload = { findings: [] };
        }
      }

      return {
        findings: parseLLMFindingsPayload(payload),
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
