import type { FindingInput } from '@vouch/types';

const PATTERNS: { label: string; probe: (s: string) => boolean }[] = [
  {
    label: 'AWS Access Key id',
    probe: (s) => s.includes('AKIA') && s.length > 10,
  },
  {
    label: 'High-entropy secret-like token',
    probe: (s) => /sk-[a-zA-Z0-9]{20,}/.test(s),
  },
];

/**
 * Lightweight secret heuristics on patch text (not AST-based).
 */
export function scanForSecrets(patch: string, filePath: string): FindingInput[] {
  const findings: FindingInput[] = [];
  let line = 0;
  for (const row of patch.split(/\r?\n/)) {
    line++;
    if (row.startsWith('+') && row.length > 1) {
      const content = row.slice(1);
      for (const { label, probe } of PATTERNS) {
        if (probe(content)) {
          findings.push({
            type: 'security',
            severity: 'high',
            confidence: 0.6,
            filePath,
            lineStart: line,
            lineEnd: line,
            title: `Possible ${label}`,
            description: 'Heuristic match in added line; verify manually.',
            codeSnippet: content.slice(0, 200),
          });
        }
      }
    }
  }
  return findings;
}
