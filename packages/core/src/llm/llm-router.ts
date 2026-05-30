import type { FindingInput } from '@vouch/types';
import { AnthropicClient } from './anthropic-client';
import { toFindingInput } from './findings-schema';
import { OllamaClient } from './ollama-client';
import { estimateAnthropicCost, estimateOllamaCost } from './pricing';
import type {
  AnalyzeDiffInput,
  LLMAnalysisResult,
  LLMClient,
  LLMRouterConfig,
  LLMRawFinding,
} from './types';

const MAX_DIFF_CHARS = 80_000;
const DEFAULT_ESCALATION_THRESHOLD = 0.75;

function buildDiffText(files: AnalyzeDiffInput['files']): string {
  const chunks = files.map((file) => `--- ${file.filename}\n${file.patch}`);
  const combined = chunks.join('\n\n');
  if (combined.length <= MAX_DIFF_CHARS) {
    return combined;
  }
  return `${combined.slice(0, MAX_DIFF_CHARS)}\n\n... [diff truncated for LLM context]`;
}

function summarizeDeterministicFindings(findings: FindingInput[]): string {
  if (findings.length === 0) {
    return 'None';
  }
  return findings
    .slice(0, 20)
    .map((f) => `- [${f.severity}/${f.type}] ${f.title} (${f.filePath}:${f.lineStart})`)
    .join('\n');
}

function shouldEscalate(finding: LLMRawFinding, threshold: number): boolean {
  return finding.needs_escalation === true || finding.confidence < threshold;
}

export class LLMRouter {
  private readonly tier1Client: LLMClient;
  private readonly tier2Client: LLMClient | null;
  private readonly escalationThreshold: number;
  private readonly mode: LLMRouterConfig['mode'];

  constructor(config: LLMRouterConfig) {
    this.mode = config.mode;
    this.escalationThreshold = config.escalationThreshold ?? DEFAULT_ESCALATION_THRESHOLD;

    if (config.mode === 'zero-cost') {
      this.tier1Client = new OllamaClient({
        baseUrl: config.ollamaBaseUrl ?? 'http://localhost:11434',
        model: config.ollamaModel ?? 'codellama:7b-code',
        timeoutMs: config.requestTimeoutMs,
      });
      this.tier2Client = null;
      return;
    }

    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is required when VOUCH_MODE=full');
    }

    this.tier1Client = new AnthropicClient({
      apiKey: config.anthropicApiKey,
      model: config.haikuModel ?? 'claude-3-5-haiku-20241022',
      timeoutMs: config.requestTimeoutMs,
    });
    this.tier2Client = new AnthropicClient({
      apiKey: config.anthropicApiKey,
      model: config.sonnetModel ?? 'claude-3-5-sonnet-20241022',
      timeoutMs: config.requestTimeoutMs,
    });
  }

  /**
   * Run hybrid LLM analysis after the deterministic pass.
   * Failures are swallowed — returns empty findings with zero cost.
   */
  async analyzeDiff(input: AnalyzeDiffInput): Promise<LLMAnalysisResult> {
    const empty: LLMAnalysisResult = {
      findings: [],
      tier1Calls: 0,
      tier2Calls: 0,
      estimatedCost: 0,
      inputTokens: 0,
      outputTokens: 0,
    };

    if (input.files.length === 0) {
      return empty;
    }

    try {
      const diffText = buildDiffText(input.files);
      const deterministicSummary = summarizeDeterministicFindings(input.deterministicFindings);

      const tier1 = await this.tier1Client.analyzeDiff(diffText, deterministicSummary);
      let tier1Calls = 1;
      let tier2Calls = 0;
      let estimatedCost =
        this.mode === 'zero-cost'
          ? estimateOllamaCost()
          : estimateAnthropicCost(tier1.inputTokens, tier1.outputTokens, 'haiku');

      const merged = new Map<string, FindingInput>();

      for (const raw of tier1.findings) {
        merged.set(`${raw.filePath}:${raw.lineStart}:${raw.title}`, toFindingInput(raw));
      }

      if (this.mode === 'full' && this.tier2Client) {
        const escalationCandidates = tier1.findings.filter((f) =>
          shouldEscalate(f, this.escalationThreshold)
        );

        for (const candidate of escalationCandidates.slice(0, 5)) {
          const snippet = candidate.codeSnippet ?? candidate.description;
          const tier2 = await this.tier2Client.analyzeDiff(diffText, deterministicSummary, {
            snippet,
            deep: true,
          });
          tier2Calls += 1;
          estimatedCost += estimateAnthropicCost(
            tier2.inputTokens,
            tier2.outputTokens,
            'sonnet'
          );

          for (const raw of tier2.findings) {
            merged.set(`${raw.filePath}:${raw.lineStart}:${raw.title}`, toFindingInput(raw));
          }
        }
      }

      return {
        findings: [...merged.values()],
        tier1Calls,
        tier2Calls,
        estimatedCost,
        inputTokens: tier1.inputTokens,
        outputTokens: tier1.outputTokens,
      };
    } catch (error) {
      console.error('[LLMRouter] analyzeDiff failed, continuing with deterministic findings only:', error);
      return empty;
    }
  }
}
