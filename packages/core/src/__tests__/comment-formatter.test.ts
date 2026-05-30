import {
  buildCheckRunPresentation,
  formatPRComment,
  splitFindings,
  type FormattedFinding,
} from '../github/comment-formatter';

const baseMeta = {
  analysisId: 'analysis-test-001',
  model: 'claude-3-5-haiku',
  confidence: 0.7,
  llmTier1Calls: 1,
  llmTier2Calls: 0,
  estimatedCost: 0.002,
  prNumber: 123,
  dashboardBaseUrl: 'http://localhost:3002',
};

function makeFinding(
  overrides: Partial<FormattedFinding> & Pick<FormattedFinding, 'type' | 'severity' | 'title'>
): FormattedFinding {
  return {
    description: overrides.description ?? overrides.title,
    filePath: overrides.filePath ?? 'package.json',
    lineStart: overrides.lineStart ?? 1,
    lineEnd: overrides.lineEnd ?? 1,
    codeSnippet: overrides.codeSnippet ?? null,
    ...overrides,
  };
}

describe('comment-formatter', () => {
  it('returns null when there are no findings', () => {
    expect(formatPRComment([], baseMeta)).toBeNull();
  });

  it('formats split sections, truncation footer, and transparency disclosure for mixed findings', () => {
    const findings: FormattedFinding[] = [
      ...Array.from({ length: 3 }, (_, index) =>
        makeFinding({
          id: `sec-${index}`,
          type: 'hallucination',
          severity: 'critical',
          title: `Hallucinated package critical-${index}`,
          codeSnippet: `@fake/pkg-${index}`,
          filePath: `src/a${index}.ts`,
          lineStart: index + 1,
        })
      ),
      ...Array.from({ length: 9 }, (_, index) =>
        makeFinding({
          id: `slop-${index}`,
          type: 'anti-pattern',
          severity: 'low',
          title: `Unused dependency slop-${index}`,
          codeSnippet: `unused-${index}`,
          filePath: 'package.json',
          lineStart: index + 10,
        })
      ),
    ];

    const markdown = formatPRComment(findings, baseMeta);
    expect(markdown).not.toBeNull();

    const body = markdown as string;

    expect(body).toContain('### 🚨 Security & Hallucinations');
    expect(body).toContain('### 🧹 Dependency Quality');
    expect(body).toContain('| Package/File | Type | Reason | Details |');
    expect(body).toContain('[View Details](http://localhost:3002/findings?pr=123');
    expect(body).toContain('> [!CAUTION]');
    expect(body).toContain('> [!NOTE]');
    expect(body).toContain('...and **2** more findings.');
    expect(body).toContain('[View the full report on the Vouch Dashboard]');
    expect(body).toContain('🤖 **AI System Disclosure:**');
    expect(body).toContain('deterministic AST parsing and **claude-3-5-haiku**');

    const { security, quality } = splitFindings(findings);
    expect(security).toHaveLength(3);
    expect(quality).toHaveLength(9);
  });

  it('uses neutral check-run conclusion for slop-only findings', () => {
    const findings = [
      makeFinding({
        type: 'anti-pattern',
        severity: 'low',
        title: 'Unused dependency: left-pad',
        codeSnippet: 'left-pad',
      }),
    ];

    const presentation = buildCheckRunPresentation(findings, baseMeta);
    expect(presentation.conclusion).toBe('neutral');
    expect(presentation.title).toContain('dependency quality');
  });

  it('uses action_required for security and hallucination findings', () => {
    const findings = [
      makeFinding({
        type: 'hallucination',
        severity: 'medium',
        title: 'npm package not found: fake-pkg',
        codeSnippet: 'fake-pkg',
      }),
    ];

    const presentation = buildCheckRunPresentation(findings, baseMeta);
    expect(presentation.conclusion).toBe('action_required');
    expect(presentation.title).toContain('hallucinated');
  });

  it('prioritizes security findings when truncating to 10 rows', () => {
    const findings: FormattedFinding[] = [
      ...Array.from({ length: 3 }, (_, index) =>
        makeFinding({
          type: 'hallucination',
          severity: 'critical',
          title: `Critical ${index}`,
          codeSnippet: `@fake/${index}`,
        })
      ),
      ...Array.from({ length: 9 }, (_, index) =>
        makeFinding({
          type: 'anti-pattern',
          severity: 'low',
          title: `Slop ${index}`,
          codeSnippet: `slop-${index}`,
        })
      ),
    ];

    const markdown = formatPRComment(findings, {
      ...baseMeta,
      llmTier1Calls: 0,
      llmTier2Calls: 0,
    }) as string;

    expect(markdown).toContain('@fake/0');
    expect(markdown).toContain('@fake/1');
    expect(markdown).toContain('@fake/2');
    expect(markdown).toContain('slop-6');
    expect(markdown).not.toContain('slop-8');
    expect(markdown).toContain('no LLM inference on this run');
  });
});
