import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { findingListInclude, toFindingRowDto } from '@/lib/findings-types';
import { FindingsFilter } from './findings-filter';
import { FindingsList } from './findings-list';

export const dynamic = 'force-dynamic';

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export interface FindingsPageProps {
  searchParams: {
    status?: string;
    severity?: string;
    repo?: string;
    pr?: string;
    finding?: string;
  };
}

function buildWhereClause(searchParams: FindingsPageProps['searchParams']): Prisma.FindingWhereInput {
  const where: Prisma.FindingWhereInput = {};
  const status = searchParams.status ?? 'open';

  if (status === 'dismissed') {
    where.status = 'dismissed';
  } else if (status === 'open' || !searchParams.status) {
    where.status = 'open';
  }

  const severity = searchParams.severity?.toLowerCase();
  if (severity && SEVERITIES.has(severity)) {
    where.severity = severity;
  }

  if (searchParams.repo) {
    where.analysis = {
      ...(where.analysis as Prisma.AnalysisWhereInput | undefined),
      repo: {
        fullName: searchParams.repo,
      },
    };
  }

  const prNumber = searchParams.pr ? Number.parseInt(searchParams.pr, 10) : NaN;
  if (!Number.isNaN(prNumber)) {
    where.analysis = {
      ...(where.analysis as Prisma.AnalysisWhereInput | undefined),
      prNumber,
    };
  }

  if (searchParams.finding) {
    where.id = searchParams.finding;
  }

  return where;
}

export default async function FindingsPage({ searchParams }: FindingsPageProps) {
  const session = await getServerSession(authOptions);
  const where = buildWhereClause(searchParams);

  const [rows, repos] = await Promise.all([
    prisma.finding.findMany({
      where,
      include: findingListInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.repo.findMany({
      select: { fullName: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const findings = rows.map(toFindingRowDto);
  const repoNames = repos.map((r) => r.fullName);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-500">Vouch</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
            Security &amp; dependency findings
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Signed in as{' '}
            <span className="font-mono text-slate-300">
              {session?.user?.login ?? session?.user?.name ?? 'user'}
            </span>
            .
            {searchParams.pr ? (
              <> Showing findings for PR <span className="font-mono text-slate-300">#{searchParams.pr}</span>.</>
            ) : (
              <> Filter and dismiss false positives to keep signal high.</>
            )}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-slate-500 transition hover:text-slate-300"
        >
          ← Dashboard home
        </Link>
      </header>

      <Suspense fallback={<div className="mb-6 h-20 animate-pulse rounded-lg bg-slate-900" />}>
        <FindingsFilter
          repos={repoNames}
          current={{
            status: searchParams.status ?? 'open',
            severity: searchParams.severity ?? '',
            repo: searchParams.repo ?? '',
          }}
        />
      </Suspense>

      <FindingsList findings={findings} />
    </div>
  );
}
