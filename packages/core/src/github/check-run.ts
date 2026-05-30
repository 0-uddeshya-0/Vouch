import type { Octokit } from '@octokit/rest';
import {
  buildCheckRunPresentation,
  type CommentMeta,
  type FormattedFinding,
} from './comment-formatter';

interface RepoRef {
  owner: string;
  repo: string;
  sha: string;
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
    findings: FormattedFinding[],
    meta: CommentMeta
  ): Promise<void> {
    const presentation = buildCheckRunPresentation(findings, meta);

    await this.octokit.rest.checks.update({
      owner: repo.owner,
      repo: repo.repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion: presentation.conclusion,
      output: {
        title: presentation.title,
        summary: presentation.summary,
        text: presentation.text,
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
