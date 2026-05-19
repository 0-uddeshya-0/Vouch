'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import type { FindingRowDto } from '@/lib/findings-types';
import { dismissFinding } from './actions';

export interface FindingsListProps {
  findings: FindingRowDto[];
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-950 text-red-300 border-red-800',
  high: 'bg-orange-950 text-orange-300 border-orange-800',
  medium: 'bg-amber-950 text-amber-300 border-amber-800',
  low: 'bg-slate-800 text-slate-300 border-slate-600',
};

function severityClass(severity: string): string {
  return SEVERITY_STYLES[severity.toLowerCase()] ?? SEVERITY_STYLES.low;
}

export function FindingsList({ findings: initialFindings }: FindingsListProps) {
  const [findings, setFindings] = useState(initialFindings);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setFindings(initialFindings);
  }, [initialFindings]);

  const handleDismiss = useCallback((id: string) => {
    setError(null);
    setPendingId(id);

    let previousStatus = 'open';
    setFindings((prev) => {
      const row = prev.find((f) => f.id === id);
      if (row) {
        previousStatus = row.status;
      }
      return prev.map((f) => (f.id === id ? { ...f, status: 'dismissed' } : f));
    });

    startTransition(async () => {
      try {
        const result = await dismissFinding(id);
        if (!result.ok) {
          setFindings((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: previousStatus } : f))
          );
          setError(result.error);
        }
      } catch (err) {
        setFindings((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: previousStatus } : f))
        );
        setError(err instanceof Error ? err.message : 'Unauthorized');
      }
      setPendingId(null);
    });
  }, []);

  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-12 text-center">
        <p className="text-slate-400">No findings yet. Run a PR analysis to populate this view.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Repository</th>
              <th className="px-4 py-3 font-medium">PR</th>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Finding</th>
              <th className="px-4 py-3 font-medium w-28">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {findings.map((finding) => {
              const isDismissed = finding.status === 'dismissed';
              const isRowPending = pendingId === finding.id && isPending;

              return (
                <tr
                  key={finding.id}
                  className={
                    isDismissed
                      ? 'bg-slate-950/40 text-slate-500'
                      : 'bg-slate-950/20 hover:bg-slate-900/40'
                  }
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    {finding.repoFullName}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">#{finding.prNumber}</td>
                  <td className="max-w-[12rem] truncate px-4 py-3 font-mono text-xs text-slate-400">
                    {finding.filePath}
                    {finding.lineStart > 0 && (
                      <span className="text-slate-600">
                        :{finding.lineStart}
                        {finding.lineEnd !== finding.lineStart ? `–${finding.lineEnd}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize ${severityClass(finding.severity)}`}
                    >
                      {finding.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-400">{finding.type}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-200">{finding.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{finding.description}</p>
                    {finding.codeSnippet && (
                      <pre className="mt-2 max-h-24 overflow-x-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-emerald-400/90">
                        {finding.codeSnippet}
                      </pre>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isDismissed ? (
                      <span className="text-xs text-slate-600">Dismissed</span>
                    ) : (
                      <button
                        type="button"
                        disabled={isRowPending}
                        onClick={() => handleDismiss(finding.id)}
                        className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isRowPending ? 'Saving…' : 'Dismiss'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
