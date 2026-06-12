import { evaluateMaintainerGate, isTestFile, referencesIssue } from '../gate/maintainer-gate';
import { DEFAULT_REPO_CONFIG } from '../config/repo-config';
import type { GateInput } from '../gate/maintainer-gate';

function gateInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    files: [{ filename: 'src/service.ts' }, { filename: 'src/__tests__/service.test.ts' }],
    prTitle: 'fix: handle timeout (fixes #12)',
    prBody: null,
    authorAssociation: 'NONE',
    findings: [],
    config: { ...DEFAULT_REPO_CONFIG },
    ...overrides,
  };
}

describe('isTestFile', () => {
  it.each([
    'src/__tests__/foo.test.ts',
    'lib/foo.spec.tsx',
    'tests/integration.py',
    'test/helpers.js',
    'pkg/test_parser.py',
    'pkg/parser_test.py',
    'conftest.py',
  ])('recognizes %s as a test file', (f) => {
    expect(isTestFile(f)).toBe(true);
  });

  it.each(['src/service.ts', 'docs/testing.md', 'src/latest.ts', 'contest.py'])(
    'does not match %s',
    (f) => {
      expect(isTestFile(f)).toBe(false);
    }
  );
});

describe('referencesIssue', () => {
  it.each([
    ['fixes #123', null],
    ['feat: add gate', 'Closes #7'],
    ['chore', 'See https://github.com/org/repo/issues/42 for context'],
  ])('detects a reference in title=%s', (title, body) => {
    expect(referencesIssue(title, body)).toBe(true);
  });

  it('returns false when nothing references an issue', () => {
    expect(referencesIssue('feat: add gate', 'A description with no links.')).toBe(false);
  });
});

describe('evaluateMaintainerGate', () => {
  it('passes a clean external PR with tests and a linked issue', () => {
    const result = evaluateMaintainerGate(gateInput());
    expect(result.verdict).toBe('pass');
    expect(result.enforced).toBe(true);
    expect(result.audience).toBe('external');
    expect(result.failedCount).toBe(0);
  });

  it('fails enforced when source changes lack tests', () => {
    const result = evaluateMaintainerGate(
      gateInput({ files: [{ filename: 'src/service.ts' }] })
    );
    expect(result.verdict).toBe('fail');
    expect(result.items.find((i) => i.id === 'tests-present')?.status).toBe('fail');
  });

  it('passes tests-present for docs-only changes', () => {
    const result = evaluateMaintainerGate(
      gateInput({ files: [{ filename: 'README.md' }, { filename: 'docs/guide.md' }] })
    );
    expect(result.items.find((i) => i.id === 'tests-present')?.status).toBe('pass');
  });

  it('fails enforced when no issue is referenced', () => {
    const result = evaluateMaintainerGate(
      gateInput({ prTitle: 'feat: add thing', prBody: 'no reference here' })
    );
    expect(result.verdict).toBe('fail');
    expect(result.items.find((i) => i.id === 'linked-issue')?.status).toBe('fail');
  });

  it('fails on hallucinated packages and high-severity security findings', () => {
    const result = evaluateMaintainerGate(
      gateInput({
        findings: [
          { type: 'hallucination', severity: 'medium' },
          { type: 'security', severity: 'critical' },
        ],
      })
    );
    expect(result.items.find((i) => i.id === 'real-packages')?.status).toBe('fail');
    expect(result.items.find((i) => i.id === 'no-security-findings')?.status).toBe('fail');
    expect(result.verdict).toBe('fail');
  });

  it('treats low-severity security findings as warn, not fail', () => {
    const result = evaluateMaintainerGate(
      gateInput({ findings: [{ type: 'security', severity: 'low' }] })
    );
    expect(result.items.find((i) => i.id === 'no-security-findings')?.status).toBe('warn');
    expect(result.verdict).toBe('pass');
  });

  it('marks dependency findings as warn and never blocks on them', () => {
    const result = evaluateMaintainerGate(
      gateInput({ findings: [{ type: 'anti-pattern', severity: 'low' }] })
    );
    expect(result.items.find((i) => i.id === 'dependency-hygiene')?.status).toBe('warn');
    expect(result.verdict).toBe('pass');
  });

  it('is advisory for OWNER/MEMBER/COLLABORATOR under gate:"external"', () => {
    for (const assoc of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
      const result = evaluateMaintainerGate(
        gateInput({ authorAssociation: assoc, files: [{ filename: 'src/service.ts' }] })
      );
      expect(result.enforced).toBe(false);
      expect(result.audience).toBe('internal');
      expect(result.verdict).toBe('advisory-fail');
    }
  });

  it('enforces on everyone under gate:"all"', () => {
    const result = evaluateMaintainerGate(
      gateInput({
        authorAssociation: 'OWNER',
        files: [{ filename: 'src/service.ts' }],
        config: { ...DEFAULT_REPO_CONFIG, gate: 'all' },
      })
    );
    expect(result.enforced).toBe(true);
    expect(result.verdict).toBe('fail');
  });

  it('omits checks disabled via config', () => {
    const result = evaluateMaintainerGate(
      gateInput({
        prTitle: 'no issue ref',
        files: [{ filename: 'src/service.ts' }],
        config: { ...DEFAULT_REPO_CONFIG, requireTests: false, requireLinkedIssue: false },
      })
    );
    expect(result.items.map((i) => i.id)).toEqual([
      'real-packages',
      'no-security-findings',
      'dependency-hygiene',
    ]);
    expect(result.verdict).toBe('pass');
  });
});
