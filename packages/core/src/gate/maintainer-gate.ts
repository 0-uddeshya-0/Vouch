/**
 * Maintainer Gate — the burden-of-proof checklist for the AI-slop era.
 *
 * Evaluates a PR against deterministic evidence checks (packages real, no
 * security findings, tests present, issue linked) and produces a verdict.
 * Strict by default for EXTERNAL contributors (where slop arrives from);
 * advisory for owners/members/collaborators. `vouch.json` overrides via
 * `gate`, `requireTests`, `requireLinkedIssue`.
 */

import type { FindingInput } from '@vouch/types';
import type { RepoConfig } from '../config/repo-config';

export interface GateFileInput {
  filename: string;
}

export interface GateInput {
  files: GateFileInput[];
  prTitle: string;
  prBody: string | null | undefined;
  /** GitHub `author_association` (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, FIRST_TIME_CONTRIBUTOR, NONE, …) */
  authorAssociation: string;
  findings: Pick<FindingInput, 'type' | 'severity'>[];
  config: RepoConfig;
}

export type GateItemStatus = 'pass' | 'fail' | 'warn';

export interface GateItem {
  id: 'real-packages' | 'no-security-findings' | 'tests-present' | 'linked-issue' | 'dependency-hygiene';
  label: string;
  status: GateItemStatus;
  detail: string;
}

export interface GateResult {
  /** True when failures set the check run to action_required for this PR */
  enforced: boolean;
  audience: 'external' | 'internal';
  items: GateItem[];
  passedCount: number;
  failedCount: number;
  verdict: 'pass' | 'fail' | 'advisory-fail';
}

/** Associations whose PRs are gated in advisory mode under gate:"external" */
const INTERNAL_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/i;

const TEST_FILE_PATTERNS = [
  /(^|\/)__tests__\//i,
  /(^|\/)tests?\//i,
  /\.(test|spec)\.[jt]sx?$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /_test\.py$/i,
  /(^|\/)conftest\.py$/i,
];

export function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(filename));
}

function isSourceCodeFile(filename: string): boolean {
  return CODE_EXTENSIONS.test(filename) && !isTestFile(filename);
}

const ISSUE_REFERENCE = /(?:#\d+\b)|(?:github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)/i;

export function referencesIssue(title: string, body: string | null | undefined): boolean {
  return ISSUE_REFERENCE.test(`${title}\n${body ?? ''}`);
}

export function evaluateMaintainerGate(input: GateInput): GateResult {
  const { config } = input;
  const audience: GateResult['audience'] = INTERNAL_ASSOCIATIONS.has(
    input.authorAssociation?.toUpperCase?.() ?? ''
  )
    ? 'internal'
    : 'external';

  const enforced =
    config.gate === 'all' || (config.gate === 'external' && audience === 'external');

  const items: GateItem[] = [];

  const hallucinations = input.findings.filter((f) => f.type === 'hallucination').length;
  items.push(
    hallucinations === 0
      ? {
          id: 'real-packages',
          label: 'All packages exist on their registries',
          status: 'pass',
          detail: 'Every imported and declared package was verified against npm/PyPI.',
        }
      : {
          id: 'real-packages',
          label: 'All packages exist on their registries',
          status: 'fail',
          detail: `${hallucinations} package${hallucinations === 1 ? '' : 's'} could not be found on any registry — hallucinated or slopsquatting bait. Remove or replace before review.`,
        }
  );

  const security = input.findings.filter((f) => f.type === 'security');
  const blockingSecurity = security.filter(
    (f) => f.severity === 'critical' || f.severity === 'high'
  ).length;
  items.push(
    blockingSecurity === 0
      ? {
          id: 'no-security-findings',
          label: 'No secrets or vulnerable versions introduced',
          status: security.length === 0 ? 'pass' : 'warn',
          detail:
            security.length === 0
              ? 'No credential patterns or known-CVE versions in the diff.'
              : `${security.length} low/medium security note${security.length === 1 ? '' : 's'} — review advised.`,
        }
      : {
          id: 'no-security-findings',
          label: 'No secrets or vulnerable versions introduced',
          status: 'fail',
          detail: `${blockingSecurity} high/critical security finding${blockingSecurity === 1 ? '' : 's'} (committed credentials or CVE-affected versions). Fix before review.`,
        }
  );

  if (config.requireTests) {
    const sourceChanged = input.files.filter((f) => isSourceCodeFile(f.filename)).length;
    const testsTouched = input.files.filter((f) => isTestFile(f.filename)).length;
    if (sourceChanged === 0) {
      items.push({
        id: 'tests-present',
        label: 'Tests accompany code changes',
        status: 'pass',
        detail: 'No source-code changes that require tests.',
      });
    } else if (testsTouched > 0) {
      items.push({
        id: 'tests-present',
        label: 'Tests accompany code changes',
        status: 'pass',
        detail: `${testsTouched} test file${testsTouched === 1 ? '' : 's'} updated alongside ${sourceChanged} source file${sourceChanged === 1 ? '' : 's'}.`,
      });
    } else {
      items.push({
        id: 'tests-present',
        label: 'Tests accompany code changes',
        status: 'fail',
        detail: `${sourceChanged} source file${sourceChanged === 1 ? '' : 's'} changed with no test files touched. Add or update tests that demonstrate the change works.`,
      });
    }
  }

  if (config.requireLinkedIssue) {
    items.push(
      referencesIssue(input.prTitle, input.prBody)
        ? {
            id: 'linked-issue',
            label: 'PR references an issue',
            status: 'pass',
            detail: 'An issue reference was found in the title or description.',
          }
        : {
            id: 'linked-issue',
            label: 'PR references an issue',
            status: 'fail',
            detail:
              'No issue reference found. Link the issue this PR addresses (e.g. "Fixes #123") so maintainers have context before reviewing.',
          }
    );
  }

  const antiPatterns = input.findings.filter((f) => f.type === 'anti-pattern').length;
  items.push(
    antiPatterns === 0
      ? {
          id: 'dependency-hygiene',
          label: 'Dependency hygiene',
          status: 'pass',
          detail: 'No unused, redundant, or natively-replaceable dependencies added.',
        }
      : {
          id: 'dependency-hygiene',
          label: 'Dependency hygiene',
          status: 'warn',
          detail: `${antiPatterns} advisory dependency finding${antiPatterns === 1 ? '' : 's'} (unused/redundant packages). Advisory — never blocks on its own.`,
        }
  );

  const failedCount = items.filter((i) => i.status === 'fail').length;
  const passedCount = items.filter((i) => i.status === 'pass').length;

  let verdict: GateResult['verdict'] = 'pass';
  if (failedCount > 0) {
    verdict = enforced ? 'fail' : 'advisory-fail';
  }

  return { enforced, audience, items, passedCount, failedCount, verdict };
}
