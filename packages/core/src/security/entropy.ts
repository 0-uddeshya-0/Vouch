import type { FindingInput } from '@vouch/types';

/**
 * Entropy backstop for secrets the 12 format patterns miss (unknown token
 * formats). It is deliberately precise, not exhaustive: the format scanner
 * (`scanForSecrets`) is the recall layer. This is the low-false-positive
 * layer, so it only fires when ALL of the following hold:
 *
 *   1. the line is not a URL or a lockfile/minified artifact,
 *   2. a secret-context keyword is present on the line (key/token/secret/…),
 *   3. a high-entropy candidate token (mixed letters+digits, length >= 20) exists,
 *   4. the token is not an obvious placeholder.
 *
 * Requiring secret context is what kills the noise — a long random-looking URL
 * or hash in a diff (the 94-false-positive portfolio case) carries no such
 * keyword, so it is never flagged.
 */

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Secret-ish assignment/label context anywhere on the line. */
const SECRET_CONTEXT =
  /(secret|token|api[_-]?key|apikey|passwd|password|pwd|auth|credential|private[_-]?key|access[_-]?key|client[_-]?secret|bearer|signing[_-]?key|encryption[_-]?key)/i;

/** Contiguous runs that could be an opaque credential. */
const CANDIDATE_TOKEN = /[A-Za-z0-9+/_=-]{20,}/g;

const PLACEHOLDER =
  /(example|placeholder|your[_-]|<your|xxxx+|redacted|changeme|dummy|sample|0{8,}|x{8,}|aaaa+)/i;

/** Files whose high-entropy strings are structurally non-secret. */
const SKIP_FILE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock)$|\.(min\.(js|css)|map|snap)$/i;

function looksLikeSecret(token: string): boolean {
  if (token.length < 20) {
    return false;
  }
  if (PLACEHOLDER.test(token)) {
    return false;
  }
  // Real opaque credentials mix letters and digits; long identifiers and
  // hex-only/word-only runs are excluded to keep precision high.
  const hasLetter = /[A-Za-z]/.test(token);
  const hasDigit = /[0-9]/.test(token);
  if (!hasLetter || !hasDigit) {
    return false;
  }
  return shannonEntropy(token) >= 3.5;
}

export const entropyScanner = {
  scan(patch: string, filePath: string): FindingInput[] {
    if (SKIP_FILE.test(filePath)) {
      return [];
    }

    const out: FindingInput[] = [];
    let line = 0;
    for (const row of patch.split(/\r?\n/)) {
      line++;
      if (!row.startsWith('+') || row.startsWith('+++')) {
        continue;
      }
      const content = row.slice(1);
      // URLs are the dominant false-positive source (og:url meta tags, links).
      if (content.includes('://')) {
        continue;
      }
      if (!SECRET_CONTEXT.test(content)) {
        continue;
      }

      const candidate = content.match(CANDIDATE_TOKEN)?.find(looksLikeSecret);
      if (!candidate) {
        continue;
      }

      out.push({
        type: 'security',
        severity: 'low',
        confidence: 0.5,
        filePath,
        lineStart: line,
        lineEnd: line,
        title: 'Possible hardcoded secret (high-entropy value)',
        description:
          'A high-entropy value sits next to a secret-like keyword. If this is a live credential, revoke and move it to an environment variable. Advisory — review to confirm.',
        codeSnippet: content.trim().slice(0, 120),
      });
    }
    return out;
  },
};
