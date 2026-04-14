/**
 * Shared API and domain types for Vouch
 */

export interface FindingInput {
  type: string;
  severity: string;
  confidence: number;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  title: string;
  description: string;
  codeSnippet?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  timestamp: string;
  services?: Record<string, 'up' | 'down' | 'unknown'>;
}

export interface PullRequestWebhookPayload {
  action?: string;
  number?: number;
  pull_request?: {
    number: number;
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
  };
  repository?: {
    id: number;
    full_name: string;
    default_branch: string;
    private: boolean;
  };
  installation?: { id: number };
  [key: string]: unknown;
}
