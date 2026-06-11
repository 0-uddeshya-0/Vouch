import { scanForSecrets } from '../security/secrets';
import { extractPackageName } from '../parsers/module-utils';

function patchWithAddedLine(line: string): string {
  return ['--- a/config.ts', '+++ b/config.ts', '@@ -1,1 +1,2 @@', ' const a = 1;', `+${line}`].join(
    '\n'
  );
}

describe('scanForSecrets', () => {
  const truePositives: Array<[string, string]> = [
    ['AWS access key ID', 'const key = "AKIAIPADSP4PJ7HZ6Q2B";'],
    ['AWS temporary key', 'aws_access_key_id = ASIAIPADSP4PJ7HZ6Q2B'],
    ['GitHub classic PAT', 'token: "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789"'],
    ['GitHub fine-grained PAT', 'GH_TOKEN=github_pat_11ABCDEFG0123456789abcdefgh'],
    ['GitHub app token', 'auth = "ghs_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789"'],
    ['Anthropic key', 'ANTHROPIC_API_KEY="sk-ant-api03-aBcDeF123456789012345"'],
    ['Stripe live key', 'stripe = Stripe("sk_live_aBcDeFgHiJkLmNoPqRsT")'],
    ['Slack bot token', 'slack_token = "xoxb-123456789012-abcdefghijkl"'],
    ['Google API key', 'gmaps = "AIzaSyA-aBcDeFgHiJkLmNoPqRsTuVwXyZ01234"'],
    ['npm token', '//registry.npmjs.org/:_authToken=npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789'],
    ['RSA private key header', '-----BEGIN RSA PRIVATE KEY-----'],
    ['OpenSSH private key header', '-----BEGIN OPENSSH PRIVATE KEY-----'],
    ['GitLab PAT', 'GITLAB_TOKEN=glpat-aBcDeFgHiJkLmNoPqRsT'],
  ];

  it.each(truePositives)('detects %s', (_label, line) => {
    const findings = scanForSecrets(patchWithAddedLine(line), 'config.ts');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].type).toBe('security');
  });

  const falsePositives: Array<[string, string]> = [
    ['placeholder token', 'const token = "your_token_here";'],
    ['AWS docs example key', 'const key = "AKIAIOSFODNN7EXAMPLE";'],
    ['env var reference', 'const key = process.env.AWS_ACCESS_KEY_ID;'],
    ['short sk- string', 'const id = "sk-123";'],
    ['xxxx placeholder', 'token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'],
    ['plain prose', 'AKIA keys must never be committed'],
    ['removed line is ignored', ''],
  ];

  it.each(falsePositives)('ignores %s', (_label, line) => {
    const findings = scanForSecrets(patchWithAddedLine(line), 'config.ts');
    expect(findings).toHaveLength(0);
  });

  it('ignores secrets on removed lines', () => {
    const patch = [
      '--- a/config.ts',
      '+++ b/config.ts',
      '@@ -1,2 +1,1 @@',
      '-const key = "AKIAIPADSP4PJ7HZ6Q2B";',
      ' const a = 1;',
    ].join('\n');
    expect(scanForSecrets(patch, 'config.ts')).toHaveLength(0);
  });

  it('reports the correct line number', () => {
    const patch = patchWithAddedLine('const key = "AKIAIPADSP4PJ7HZ6Q2B";');
    const findings = scanForSecrets(patch, 'config.ts');
    expect(findings[0].lineStart).toBe(5);
  });
});

describe('extractPackageName specifier filtering', () => {
  it.each([
    ['lodash', 'lodash'],
    ['lodash/fp', 'lodash'],
    ['@types/node', '@types/node'],
    ['@babel/core/lib/index', '@babel/core'],
  ])('returns package name for %s', (specifier, expected) => {
    expect(extractPackageName(specifier)).toBe(expected);
  });

  it.each([
    ['./utils', 'relative import'],
    ['../lib/foo', 'parent relative import'],
    ['/abs/path', 'absolute path'],
    ['@/lib/prisma', 'tsconfig path alias'],
    ['~/components/Button', 'tilde alias'],
    ['#internal/config', 'subpath import'],
  ])('returns empty string for %s (%s)', (specifier) => {
    expect(extractPackageName(specifier)).toBe('');
  });
});
