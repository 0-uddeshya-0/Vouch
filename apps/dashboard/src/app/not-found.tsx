import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-32 text-center">
      <p className="font-mono text-sm text-emerald-500">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-100">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        That route doesn&rsquo;t exist. Head back to the dashboard.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
      >
        ← Home
      </Link>
    </div>
  );
}
