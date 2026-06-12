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
  status: 'ok' | 'degraded' | 'error' | 'healthy' | 'unhealthy' | 'ready' | 'not ready';
  version: string;
  timestamp: string;
  services?: Record<string, 'up' | 'down' | 'unknown' | 'connected' | 'disconnected'>;
}

export interface PullRequestWebhookPayload {
  action?: string;
  number?: number;
  pull_request?: {
    number: number;
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
    title?: string;
    body?: string | null;
    /** OWNER | MEMBER | COLLABORATOR | CONTRIBUTOR | FIRST_TIME_CONTRIBUTOR | NONE */
    author_association?: string;
  };
  repository?: {
    id: number;
    full_name: string;
    default_branch: string;
    private: boolean;
    owner?: { login: string; type: string };
  };
  /**
   * On most app webhook events GitHub sends only `{ id, node_id }` here.
   * The full object (with `account`) is only present on `installation` and
   * `installation_repositories` events.
   */
  installation?: {
    id: number;
    account?: { login: string; type: string };
  };
  [key: string]: unknown;
}
