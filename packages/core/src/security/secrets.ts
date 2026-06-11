import type { FindingInput } from '@vouch/types';

interface SecretPattern {
  label: string;
  regex: RegExp;
  severity: 'critical' | 'high';
  confidence: number;
}

/**
 * Credential formats with distinctive, low-false-positive prefixes.
 * Generic high-entropy strings are handled separately by the entropy scanner.
 */
const PATTERNS: SecretPattern[] = [
  {
    label: 'AWS access key ID',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    severity: 'critical',
    confidence: 0.9,
  },
  {
    label: 'GitHub token',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
    severity: 'critical',
    confidence: 0.9,
  },
  {
    label: 'Anthropic API key',
    regex: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/,
    severity: 'critical',
    confidence: 0.9,
  },
  {
    label: 'OpenAI-style API key',
    regex: /\bsk-[a-zA-Z0-9]{20,}\b/,
    severity: 'high',
    confidence: 0.7,
  },
  {
    label: 'Stripe live secret key',
    regex: /\b(?:sk|rk)_live_[a-zA-Z0-9]{20,}\b/,
    severity: 'critical',
    confidence: 0.9,
  },
  {
    label: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    severity: 'high',
    confidence: 0.85,
  },
  {
    label: 'Google API key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/,
    severity: 'high',
    confidence: 0.85,
  },
  {
    label: 'npm access token',
    regex: /\bnpm_[A-Za-z0-9]{36,}\b/,
    severity: 'high',
    confidence: 0.85,
  },
  {
    label: 'Private key material',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
    severity: 'critical',
    confidence: 0.9,
  },
  {
    label: 'GitLab personal access token',
    regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
    severity: 'high',
    confidence: 0.85,
  },
  {
    label: 'SendGrid API key',
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/,
    severity: 'high',
    confidence: 0.85,
  },
  {
    label: 'Twilio API key',
    regex: /\bSK[0-9a-fA-F]{32}\b/,
    severity: 'high',
    confidence: 0.7,
  },
];

/** Obvious placeholders that should not be reported even when a pattern matches. */
const PLACEHOLDER_MARKERS = [
  'example',
  'placeholder',
  'your_',
  'your-',
  '<your',
  'xxxx',
  'redacted',
  'changeme',
  'dummy',
  'sample',
];

function looksLikePlaceholder(content: string): boolean {
  const lower = content.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Pattern-based secret scan over added diff lines (the entropy scanner covers
 * generic high-entropy strings these prefixes miss).
 */
export function scanForSecrets(patch: string, filePath: string): FindingInput[] {
  const findings: FindingInput[] = [];
  let line = 0;
  for (const row of patch.split(/\r?\n/)) {
    line++;
    if (!row.startsWith('+') || row.startsWith('+++')) {
      continue;
    }
    const content = row.slice(1);
    if (looksLikePlaceholder(content)) {
      continue;
    }
    for (const { label, regex, severity, confidence } of PATTERNS) {
      if (regex.test(content)) {
        findings.push({
          type: 'security',
          severity,
          confidence,
          filePath,
          lineStart: line,
          lineEnd: line,
          title: `Possible ${label} committed in diff`,
          description: `An added line matches the ${label} format. If this is a real credential, revoke it immediately — committing it to the repository exposes it in git history even after removal.`,
          codeSnippet: content.slice(0, 200),
        });
        break; // one finding per line is enough
      }
    }
  }
  return findings;
}
