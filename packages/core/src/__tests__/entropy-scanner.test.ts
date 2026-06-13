import { entropyScanner } from '../security/entropy';
import { isBlockingFinding, hasBlockingFindings } from '../github/comment-formatter';

function added(line: string, file = 'src/config.ts'): ReturnType<typeof entropyScanner.scan> {
  const patch = ['@@ -1,1 +1,2 @@', ' const a = 1;', `+${line}`].join('\n');
  return entropyScanner.scan(patch, file);
}

describe('entropyScanner precision', () => {
  it('does NOT flag public URLs in meta tags (the portfolio false-positive case)', () => {
    const metas = [
      '<meta property="og:url" content="https://uddeshya-portfolio.vercel.app/about" />',
      '<meta property="og:image" content="https://uddeshya-portfolio.vercel.app/og-cover-2026.png" />',
      '<link rel="canonical" href="https://0-uddeshya-0.github.io/portfolio/projects/vouch" />',
      '<a href="https://www.linkedin.com/in/uddeshya-kumar-9a8b7c6d5">LinkedIn</a>',
    ];
    for (const line of metas) {
      expect(added(line)).toHaveLength(0);
    }
  });

  it('does NOT flag long identifiers, prose, or hashes without secret context', () => {
    expect(added('const someVeryLongDescriptiveVariableNameForState = useState(null);')).toHaveLength(0);
    expect(added('// This commit reverts abcdef1234567890abcdef1234567890abcdef12 entirely')).toHaveLength(0);
    expect(added('export const SUPPORTED_LOCALES = ["en", "de", "fr", "es", "ja"];')).toHaveLength(0);
  });

  it('does NOT flag high-entropy strings in lockfiles', () => {
    const line = '      "integrity": "sha512-AbC123dEf456GhI789jKl012MnO345pQr678StU901vWx234yZ=="';
    expect(added(line, 'package-lock.json')).toHaveLength(0);
  });

  it('does NOT flag placeholders even with secret context', () => {
    expect(added('const apiKey = "your_api_key_here_xxxxxxxxxxxx";')).toHaveLength(0);
    expect(added('AWS_SECRET_ACCESS_KEY=changeme0000000000000000')).toHaveLength(0);
  });

  it('DOES flag a high-entropy token next to a secret keyword', () => {
    const findings = added('const apiSecret = "h8Kd92ParserQ7zXmLp04vTnB31wYcEf5";');
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('security');
    expect(findings[0].severity).toBe('low');
    expect(findings[0].lineStart).toBe(3);
  });

  it('DOES flag a secret-named env assignment', () => {
    expect(added('DATABASE_PASSWORD=Zk9aQ2mX7pL4rT1nB8vC3wE6yH0jF5dS')).toHaveLength(1);
  });

  it('ignores removed lines', () => {
    const patch = ['@@ -1,2 +1,1 @@', '-const apiKey = "h8Kd92ParserQ7zXmLp04vTnB31wYc";', ' ok'].join('\n');
    expect(entropyScanner.scan(patch, 'src/config.ts')).toHaveLength(0);
  });
});

describe('blocking consistency (low-severity findings never gate a merge)', () => {
  const base = {
    type: 'security' as const,
    title: 't',
    description: 'd',
    filePath: 'f',
    lineStart: 1,
  };

  it('does not block on low-severity security findings (entropy notes)', () => {
    expect(isBlockingFinding({ ...base, severity: 'low' })).toBe(false);
    // 94 low-severity entropy findings must not flip the check to action_required
    const many = Array.from({ length: 94 }, () => ({ ...base, severity: 'low' as const }));
    expect(hasBlockingFindings(many)).toBe(false);
  });

  it('does not block on medium-severity security findings', () => {
    expect(isBlockingFinding({ ...base, severity: 'medium' })).toBe(false);
  });

  it('blocks on high/critical security findings', () => {
    expect(isBlockingFinding({ ...base, severity: 'high' })).toBe(true);
    expect(isBlockingFinding({ ...base, severity: 'critical' })).toBe(true);
  });

  it('blocks on hallucinations regardless of severity', () => {
    expect(isBlockingFinding({ ...base, type: 'hallucination', severity: 'medium' })).toBe(true);
  });

  it('never blocks on anti-pattern (quality) findings', () => {
    expect(isBlockingFinding({ ...base, type: 'anti-pattern', severity: 'high' })).toBe(false);
  });
});
