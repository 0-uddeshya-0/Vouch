import type { FindingInput } from '@vouch/types';

export type VouchMode = 'zero-cost' | 'full';

export interface LLMRouterConfig {
  mode: VouchMode;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  haikuModel?: string;
  sonnetModel?: string;
  escalationThreshold?: number;
  requestTimeoutMs?: number;
}

export interface DiffFileInput {
  filename: string;
  patch: string;
}

export interface AnalyzeDiffInput {
  files: DiffFileInput[];
  deterministicFindings: FindingInput[];
}

export interface LLMUsageStats {
  tier1Calls: number;
  tier2Calls: number;
  estimatedCost: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMAnalysisResult extends LLMUsageStats {
  findings: FindingInput[];
}

/** Raw finding shape returned by LLM tool/JSON schema */
export interface LLMRawFinding {
  type: string;
  severity: string;
  confidence: number;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  title: string;
  description: string;
  codeSnippet?: string;
  needs_escalation?: boolean;
}

export interface LLMClientResponse {
  findings: LLMRawFinding[];
  inputTokens: number;
  outputTokens: number;
}

export interface LLMClient {
  analyzeDiff(
    diffText: string,
    deterministicSummary: string,
    options?: { snippet?: string; deep?: boolean }
  ): Promise<LLMClientResponse>;
}
