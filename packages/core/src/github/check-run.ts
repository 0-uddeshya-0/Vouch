import type { Octokit } from '@octokit/rest';

interface RepoRef {
  owner: string;
  repo: string;
  sha: string;
}

interface FindingRow {
  type: string;
  severity: string;
  title: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  description: string;
}

interface CheckMeta {
  analysisId: string;
  model: string;
  confidence: number;
  llmTier1Calls: number;
  llmTier2Calls: number;
  estimatedCost: number;
}

export class CheckRunManager {
  constructor(private readonly octokit: Octokit) {}

  async createCheckRun(params: RepoRef & { name?: string }): Promise<{ id: number }> {
    const { data } = await this.octokit.rest.checks.create({
      owner: params.owner,
      repo: params.repo,
      name: params.name ?? 'Vouch',
      head_sha: params.sha,
      status: 'in_progress',
    });
    return { id: data.id };
  }

  async updateCheckRun(
    checkRunId: number,
    repo: RepoRef,
    findings: FindingRow[],
    meta: CheckMeta
  ): Promise<void> {
    const summary = `Vouch found ${findings.length} issue(s). Model ${meta.model}.`;
    const text = findings
      .map((f) => `- ${f.severity} ${f.title} (${f.filePath}:${f.lineStart})`)
      .join('\n');
    await this.octokit.rest.checks.update({
      owner: repo.owner,
      repo: repo.repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion: findings.length > 0 ? 'neutral' : 'success',
      output: {
        title: 'Vouch scan',
        summary,
        text: text || 'No issues.',
      },
    });
  }

  async completeCheckRun(
    checkRunId: number,
    repo: RepoRef,
    success: boolean,
    message: string
  ): Promise<void> {
    await this.octokit.rest.checks.update({
      owner: repo.owner,
      repo: repo.repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion: success ? 'success' : 'failure',
      output: {
        title: success ? 'Vouch completed' : 'Vouch failed',
        summary: message,
      },
    });
  }
}
