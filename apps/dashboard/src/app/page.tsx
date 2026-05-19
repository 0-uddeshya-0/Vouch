import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
        Vouch Dashboard
      </h1>
      <p className="mt-4 text-slate-400">
        Review hallucinated dependencies, security signals, and dependency quality findings from
        your pull request analyses.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        {session ? (
          <>
            <Link
              href="/findings"
              className="inline-flex items-center rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-4 py-3 text-sm font-medium text-emerald-300 transition hover:border-emerald-700 hover:bg-emerald-950/70"
            >
              View findings →
            </Link>
            <p className="w-full text-sm text-slate-500">
              Signed in as{' '}
              <span className="font-mono text-slate-400">
                {session.user?.login ?? session.user?.name}
              </span>
            </p>
          </>
        ) : (
          <Link
            href="/api/auth/signin?callbackUrl=/findings"
            className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
          >
            Sign in with GitHub
          </Link>
        )}
      </div>
    </div>
  );
}
