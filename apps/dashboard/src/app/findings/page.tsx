import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { findingListInclude, toFindingRowDto } from '@/lib/findings-types';
import { FindingsList } from './findings-list';

export const dynamic = 'force-dynamic';

export default async function FindingsPage() {
  const rows = await prisma.finding.findMany({
    include: findingListInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const findings = rows.map(toFindingRowDto);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-500">Vouch</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
            Security &amp; dependency findings
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Latest results from PR analysis across connected repositories. Dismiss false positives
            to keep the signal high.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-slate-500 transition hover:text-slate-300"
        >
          ← Dashboard home
        </Link>
      </header>

      <FindingsList findings={findings} />
    </div>
  );
}
