import type { FindingInput } from '@vouch/types';

interface CommentMeta {
  analysisId: string;
  model: string;
  confidence: number;
  llmTier1Calls: number;
  llmTier2Calls: number;
  estimatedCost: number;
}

/** Minimal markdown summary for PR comments */
export function formatPRComment(
  findings: Array<{
    type: string;
    severity: string;
    title: string;
    filePath: string;
    lineStart: number;
  }>,
  meta: CommentMeta
): string {
  const lines: string[] = [];
  lines.push('## Vouch analysis');
  lines.push('');
  lines.push(`Analysis \`${meta.analysisId}\` · model ${meta.model} · confidence threshold ${meta.confidence}`);
  lines.push(`LLM calls: tier1=${meta.llmTier1Calls}, tier2=${meta.llmTier2Calls}, est. cost=${meta.estimatedCost}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings recorded.');
    return lines.join('\n');
  }
  lines.push(`**${findings.length} finding(s)**`);
  for (const f of findings) {
    lines.push(`- **${f.severity}** [\`${f.type}\`] ${f.title} — \`${f.filePath}:${f.lineStart}\``);
  }
  return lines.join('\n');
}
