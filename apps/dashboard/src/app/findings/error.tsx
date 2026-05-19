'use client';

export default function FindingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <h2 className="text-lg font-medium text-red-300">Failed to load findings</h2>
      <p className="mt-2 text-sm text-slate-500">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
      >
        Try again
      </button>
    </div>
  );
}
