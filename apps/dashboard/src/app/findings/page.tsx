import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/auth';
import { isDemoMode } from '@/lib/demo-mode';
import { getPrisma } from '@/lib/prisma';
import {
  findingListInclude,
  toFindingRowDto,
  type FindingWhereClause,
  type FindingWithContext,
} from '@/lib/findings-types';
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

function buildWhereClause(searchParams: FindingsPageProps['searchParams']): FindingWhereClause {
  const where: FindingWhereClause = {};
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
      ...where.analysis,
      repo: {
        fullName: searchParams.repo,
      },
    };
  }

  const prNumber = searchParams.pr ? Number.parseInt(searchParams.pr, 10) : NaN;
  if (!Number.isNaN(prNumber)) {
    where.analysis = {
      ...where.analysis,
      prNumber,
    };
  }

  if (searchParams.finding) {
    where.id = searchParams.finding;
  }

  return where;
}

interface StatCard {
  label: string;
  value: number;
  accent: string;
}

export default async function FindingsPage({ searchParams }: FindingsPageProps) {
  const session = await getServerSession(authOptions);
  const demo = isDemoMode();
  const where = buildWhereClause(searchParams);
  const prisma = getPrisma();

  const [rows, repos, openBySeverity, hallucinationCount] = await Promise.all([
    prisma.finding.findMany({
      where,
      include: findingListInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }) as Promise<FindingWithContext[]>,
    prisma.repo.findMany({
      select: { fullName: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.finding.groupBy({
      by: ['severity'],
      where: { status: 'open' },
      _count: { _all: true },
    }),
    prisma.finding.count({ where: { status: 'open', type: 'hallucination' } }),
  ]);

  const findings = rows.map(toFindingRowDto);
  const repoNames = repos.map((r: { fullName: string }) => r.fullName);

  const severityCount = (severity: string): number =>
    openBySeverity.find((g: { severity: string }) => g.severity === severity)?._count._all ?? 0;
  const totalOpen = openBySeverity.reduce(
    (sum: number, g: { _count: { _all: number } }) => sum + g._count._all,
    0
  );

  const stats: StatCard[] = [
    { label: 'Open findings', value: totalOpen, accent: 'text-slate-100' },
    {
      label: 'Critical / High',
      value: severityCount('critical') + severityCount('high'),
      accent: 'text-red-400',
    },
    { label: 'Hallucinated packages', value: hallucinationCount, accent: 'text-amber-400' },
    { label: 'Repositories', value: repoNames.length, accent: 'text-emerald-400' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {demo && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-400" />
          Demo mode — authentication is bypassed (development only). Run{' '}
          <code className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs">pnpm demo</code>{' '}
          to refresh the sample analysis.
        </div>
      )}

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-500">Vouch</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
            Security &amp; dependency findings
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            {session ? (
              <>
                Signed in as{' '}
                <span className="font-mono text-slate-300">
                  {session.user?.login ?? session.user?.name}
                </span>
                .
              </>
            ) : null}
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

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${stat.accent}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

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
