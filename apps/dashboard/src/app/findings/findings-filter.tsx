'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

export interface FindingsFilterProps {
  repos: string[];
  current: {
    status: string;
    severity: string;
    repo: string;
  };
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export function FindingsFilter({ repos, current }: FindingsFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const applyParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [pathname, router, searchParams]
  );

  return (
    <div
      className={`mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4 ${
        isPending ? 'opacity-70' : ''
      }`}
    >
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Status
        <select
          value={current.status}
          onChange={(e) => applyParams({ status: e.target.value })}
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="open">Open</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Severity
        <select
          value={current.severity}
          onChange={(e) => applyParams({ severity: e.target.value || null })}
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-slate-500">
        Repository
        <select
          value={current.repo}
          onChange={(e) => applyParams({ repo: e.target.value || null })}
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All repositories</option>
          {repos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
