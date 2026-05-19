import Link from 'next/link';

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
        Vouch Dashboard
      </h1>
      <p className="mt-4 text-slate-400">
        Review hallucinated dependencies, security signals, and dependency quality findings from
        your pull request analyses.
      </p>

      <ul className="mt-10 space-y-3">
        <li>
          <Link
            href="/findings"
            className="inline-flex items-center rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-4 py-3 text-sm font-medium text-emerald-300 transition hover:border-emerald-700 hover:bg-emerald-950/70"
          >
            View findings →
          </Link>
        </li>
      </ul>
    </div>
  );
}
