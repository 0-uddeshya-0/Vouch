import { z } from 'zod';
import type { FindingInput } from '@vouch/types';
import type { LLMRawFinding } from './types';

export const llmRawFindingSchema = z.object({
  type: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  filePath: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  codeSnippet: z.string().optional(),
  needs_escalation: z.boolean().optional(),
});

export const llmFindingsResponseSchema = z.object({
  findings: z.array(llmRawFindingSchema),
});

export const ANTHROPIC_FINDINGS_TOOL = {
  name: 'report_findings',
  description: 'Report security and code quality findings from a pull request diff.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Finding category e.g. security, hallucination' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            filePath: { type: 'string' },
            lineStart: { type: 'integer' },
            lineEnd: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            codeSnippet: { type: 'string' },
            needs_escalation: { type: 'boolean' },
          },
          required: [
            'type',
            'severity',
            'confidence',
            'filePath',
            'lineStart',
            'lineEnd',
            'title',
            'description',
          ],
        },
      },
    },
    required: ['findings'],
  },
} as const;

export function parseLLMFindingsPayload(payload: unknown): LLMRawFinding[] {
  const parsed = llmFindingsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.findings;
}

export function toFindingInput(raw: LLMRawFinding): FindingInput {
  return {
    type: raw.type,
    severity: raw.severity,
    confidence: raw.confidence,
    filePath: raw.filePath,
    lineStart: raw.lineStart,
    lineEnd: raw.lineEnd,
    title: raw.title,
    description: raw.description,
    codeSnippet: raw.codeSnippet,
  };
}
