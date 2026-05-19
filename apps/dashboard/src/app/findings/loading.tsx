export default function FindingsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-3">
        <div className="h-4 w-16 animate-pulse rounded bg-slate-800" />
        <div className="h-8 w-72 animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-800/80" />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
          <div className="flex gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 w-16 animate-pulse rounded bg-slate-800" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-800/80">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-6">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-800/90" />
              <div className="h-4 w-12 animate-pulse rounded bg-slate-800/90" />
              <div className="h-4 flex-1 animate-pulse rounded bg-slate-800/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
