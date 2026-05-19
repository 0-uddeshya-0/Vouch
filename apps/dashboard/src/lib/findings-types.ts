import type { Prisma } from '@prisma/client';

export const findingListInclude = {
  analysis: {
    include: {
      repo: true,
    },
  },
} as const satisfies Prisma.FindingInclude;

export type FindingWithContext = Prisma.FindingGetPayload<{
  include: typeof findingListInclude;
}>;

/** Serializable row passed from Server Component to Client Component */
export interface FindingRowDto {
  id: string;
  type: string;
  severity: string;
  confidence: number;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  title: string;
  description: string;
  codeSnippet: string | null;
  status: string;
  createdAt: string;
  repoFullName: string;
  prNumber: number;
}

export function toFindingRowDto(finding: FindingWithContext): FindingRowDto {
  return {
    id: finding.id,
    type: finding.type,
    severity: finding.severity,
    confidence: finding.confidence,
    filePath: finding.filePath,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    title: finding.title,
    description: finding.description,
    codeSnippet: finding.codeSnippet,
    status: finding.status,
    createdAt: finding.createdAt.toISOString(),
    repoFullName: finding.analysis.repo.fullName,
    prNumber: finding.analysis.prNumber,
  };
}
