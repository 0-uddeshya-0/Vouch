import { LLMRouter } from '../llm/llm-router';
import { estimateAnthropicCost } from '../llm/pricing';
import type { LLMClient, LLMClientResponse } from '../llm/types';

class MockLLMClient implements LLMClient {
  constructor(
    private readonly response: LLMClientResponse,
    private readonly onCall?: (options?: { snippet?: string; deep?: boolean }) => void
  ) {}

  async analyzeDiff(
    _diffText: string,
    _deterministicSummary: string,
    options?: { snippet?: string; deep?: boolean }
  ): Promise<LLMClientResponse> {
    this.onCall?.(options);
    return this.response;
  }
}

describe('LLMRouter', () => {
  it('merges tier-1 findings and tracks zero cost in zero-cost mode', async () => {
    const tier1Response: LLMClientResponse = {
      findings: [
        {
          type: 'security',
          severity: 'high',
          confidence: 0.9,
          filePath: 'src/db.ts',
          lineStart: 10,
          lineEnd: 10,
          title: 'Possible SQL injection',
          description: 'User input concatenated into SQL query.',
          codeSnippet: 'query(`SELECT * FROM users WHERE id = ${id}`)',
          needs_escalation: false,
        },
      ],
      inputTokens: 1000,
      outputTokens: 200,
    };

    const router = new LLMRouter({
      mode: 'zero-cost',
      ollamaBaseUrl: 'http://localhost:11434',
    });

    (router as unknown as { tier1Client: LLMClient }).tier1Client = new MockLLMClient(tier1Response);

    const result = await router.analyzeDiff({
      files: [{ filename: 'src/db.ts', patch: '+query(`SELECT * FROM users WHERE id = ${id}`)' }],
      deterministicFindings: [],
    });

    expect(result.tier1Calls).toBe(1);
    expect(result.tier2Calls).toBe(0);
    expect(result.estimatedCost).toBe(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain('SQL injection');
  });

  it('escalates low-confidence tier-1 findings to tier-2 in full mode', async () => {
    const tier1Response: LLMClientResponse = {
      findings: [
        {
          type: 'security',
          severity: 'medium',
          confidence: 0.5,
          filePath: 'src/eval.ts',
          lineStart: 3,
          lineEnd: 3,
          title: 'Unsafe eval usage',
          description: 'eval called on dynamic input',
          codeSnippet: 'eval(userInput)',
          needs_escalation: true,
        },
      ],
      inputTokens: 2000,
      outputTokens: 400,
    };

    const tier2Response: LLMClientResponse = {
      findings: [
        {
          type: 'security',
          severity: 'critical',
          confidence: 0.95,
          filePath: 'src/eval.ts',
          lineStart: 3,
          lineEnd: 3,
          title: 'Critical: remote code execution via eval',
          description: 'Untrusted input passed directly to eval().',
          codeSnippet: 'eval(userInput)',
        },
      ],
      inputTokens: 3000,
      outputTokens: 600,
    };

    const router = new LLMRouter({
      mode: 'full',
      anthropicApiKey: 'test-key',
    });

    let tier2Invoked = false;
    (router as unknown as { tier1Client: LLMClient }).tier1Client = new MockLLMClient(tier1Response);
    (router as unknown as { tier2Client: LLMClient }).tier2Client = new MockLLMClient(
      tier2Response,
      (options) => {
        if (options?.deep) {
          tier2Invoked = true;
        }
      }
    );

    const result = await router.analyzeDiff({
      files: [{ filename: 'src/eval.ts', patch: '+eval(userInput)' }],
      deterministicFindings: [],
    });

    expect(tier2Invoked).toBe(true);
    expect(result.tier1Calls).toBe(1);
    expect(result.tier2Calls).toBe(1);
    expect(result.estimatedCost).toBeCloseTo(
      estimateAnthropicCost(2000, 400, 'haiku') + estimateAnthropicCost(3000, 600, 'sonnet'),
      6
    );
    expect(result.findings.some((f) => f.title.includes('remote code execution'))).toBe(true);
  });

  it('returns empty findings when LLM client throws', async () => {
    const router = new LLMRouter({
      mode: 'zero-cost',
    });

    (router as unknown as { tier1Client: LLMClient }).tier1Client = {
      analyzeDiff: async () => {
        throw new Error('timeout');
      },
    };

    const result = await router.analyzeDiff({
      files: [{ filename: 'a.ts', patch: '+const x = 1' }],
      deterministicFindings: [],
    });

    expect(result.findings).toEqual([]);
    expect(result.tier1Calls).toBe(0);
  });
});
