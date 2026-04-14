import type { FindingInput } from '@vouch/types';

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let h = 0;
  const n = s.length;
  for (const c of freq.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

export const entropyScanner = {
  scan(patch: string, filePath: string): FindingInput[] {
    const out: FindingInput[] = [];
    let line = 0;
    for (const row of patch.split(/\r?\n/)) {
      line++;
      if (!row.startsWith('+') || row.length < 2) {
        continue;
      }
      const content = row.slice(1).trim();
      if (content.length < 32) {
        continue;
      }
      if (shannonEntropy(content) > 4.5) {
        out.push({
          type: 'security',
          severity: 'low',
          confidence: 0.35,
          filePath,
          lineStart: line,
          lineEnd: line,
          title: 'High entropy string',
          description: 'Long added string with high Shannon entropy; may be a secret or may be benign data.',
          codeSnippet: content.slice(0, 120),
        });
      }
    }
    return out;
  },
};
