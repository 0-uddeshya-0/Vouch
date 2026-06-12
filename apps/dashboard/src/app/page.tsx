import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { SignInButton } from '@/components/sign-in-button';
import { isDemoMode } from '@/lib/demo-mode';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    'This GitHub account is not on the dashboard allowlist. Add your login to DASHBOARD_ALLOWED_LOGINS.',
  Configuration: 'Authentication is misconfigured — check the dashboard environment variables.',
  OAuthCallback: 'GitHub sign-in failed during the callback. Verify the app callback URL and try again.',
  OAuthSignin: 'Could not start GitHub sign-in. Try again in a moment.',
};

const GATE_PREVIEW = [
  { ok: false, label: 'All packages exist on their registries', detail: '`express-auth-slop` not found on npm — hallucinated or slopsquatting bait' },
  { ok: false, label: 'Tests accompany code changes', detail: '3 source files changed, no test files touched' },
  { ok: false, label: 'PR references an issue', detail: 'no issue linked — add "Fixes #123" for context' },
  { ok: true, label: 'No secrets or vulnerable versions introduced', detail: 'diff is clean' },
  { ok: true, label: 'Dependency hygiene', detail: 'no unused or redundant packages' },
];

export default async function Home({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const session = await getServerSession(authOptions);
  const demo = isDemoMode();
  const canViewFindings = Boolean(session) || demo;
  const authError = searchParams?.error
    ? AUTH_ERROR_MESSAGES[searchParams.error] ?? `Sign-in failed (${searchParams.error}). Try again.`
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      {authError && (
        <div className="mb-10 max-w-xl rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200" role="alert">
          {authError}
        </div>
      )}

      {/* Hero: the crisis, and the gate as the artifact */}
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-fade-up">
          <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-slate-50 [text-wrap:balance] sm:text-5xl">
            Your reviewers are drowning in <span className="text-emerald-400">AI slop</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            AI-written pull requests get accepted a third as often as human ones and carry
            1.7&times; more defects — yet they arrive five a day, and someone has to read them all.
            Projects are shutting down under the load.
          </p>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-300">
            Vouch is the gate that flips the burden of proof: contributors demonstrate their PR
            holds up — packages real, tests present, no secrets, no known CVEs — <em>before</em> a
            human spends a minute on it.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {canViewFindings ? (
              <Link
                href="/findings"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                View findings <span aria-hidden>→</span>
              </Link>
            ) : (
              <SignInButton />
            )}
            <a
              href="https://github.com/apps/vouch-review"
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Install on a repo — it&rsquo;s free
            </a>
          </div>

          <p className="mt-5 text-sm text-slate-500">
            Deterministic checks only. No LLM opinions can block a merge. Open source, MIT.
          </p>
          {demo && (
            <p className="mt-2 text-xs text-amber-400/90">
              Demo mode is on — findings are open without sign-in (development only).
            </p>
          )}
        </div>

        {/* The product is the picture: a live-looking gate verdict */}
        <figure className="animate-fade-up rounded-xl border border-slate-800 bg-slate-900/60 shadow-2xl shadow-black/40" style={{ animationDelay: '120ms' }}>
          <figcaption className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <span className="font-mono text-xs text-slate-400">vouch-review[bot] commented</span>
            <span className="rounded-full border border-red-900/60 bg-red-950/40 px-2.5 py-0.5 text-xs font-medium text-red-300">
              review gated
            </span>
          </figcaption>
          <div className="px-5 py-4">
            <p className="text-sm font-semibold text-slate-100">
              🛡️ Maintainer Gate — 2/5 evidence checks passed
            </p>
            <ul className="mt-4 space-y-3">
              {GATE_PREVIEW.map((item) => (
                <li key={item.label} className="flex gap-3 text-sm">
                  <span aria-hidden className="mt-0.5">{item.ok ? '✅' : '❌'}</span>
                  <span>
                    <span className={item.ok ? 'text-slate-300' : 'font-medium text-slate-100'}>
                      {item.label}
                    </span>
                    <span className="block text-xs leading-relaxed text-slate-500">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-500">
              The contributor fixes the ❌ items. The maintainer reviews once, when it&rsquo;s worth
              their time.
            </p>
          </div>
        </figure>
      </section>

      {/* Evidence, not opinions */}
      <section className="mt-28 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100 [text-wrap:balance]">
          Every check is a fact, not a model&rsquo;s guess
        </h2>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          AI review bots drown teams in confident-sounding comments until everyone learns to ignore
          them. Vouch only says things it can prove — so when it speaks, it&rsquo;s worth reading.
        </p>
        <dl className="mt-8 space-y-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
            <dt className="shrink-0 font-mono text-sm text-emerald-400 sm:w-56">registry 404</dt>
            <dd className="text-sm leading-relaxed text-slate-300">
              Every import and new dependency is checked against live npm and PyPI. A package that
              doesn&rsquo;t exist is a hallucination — and unregistered names are exactly what
              slopsquatting attackers wait for.
            </dd>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
            <dt className="shrink-0 font-mono text-sm text-emerald-400 sm:w-56">OSV advisory ID</dt>
            <dd className="text-sm leading-relaxed text-slate-300">
              New dependency versions are batch-checked against the OSV vulnerability database. One
              finding per package, advisory IDs included, link to the fix.
            </dd>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
            <dt className="shrink-0 font-mono text-sm text-emerald-400 sm:w-56">AST, not regex vibes</dt>
            <dd className="text-sm leading-relaxed text-slate-300">
              Imports are parsed with the TypeScript compiler and tree-sitter; secrets matched
              against 12 credential formats; declared-but-unused dependencies caught by reading the
              diff, not guessing about it.
            </dd>
          </div>
        </dl>
      </section>

      {/* Enforcement is yours */}
      <section className="mt-24 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100 [text-wrap:balance]">
            Strict where slop comes from, quiet everywhere else
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400">
            By default the gate enforces on external contributors — where AI-generated drive-by PRs
            originate — and stays advisory for your own team. Clean PRs get silence: no comment, a
            green check. One <span className="font-mono text-slate-300">vouch.json</span> in your
            repo tunes everything.
          </p>
        </div>
        <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-5 font-mono text-sm leading-relaxed text-slate-300">
          <code>{`{
  // who the gate enforces on
  "gate": "external",        // "all" | "off"
  "requireTests": true,
  "requireLinkedIssue": true,

  // noise control
  "ignoreScopes": ["@yourorg"],
  "slopThreshold": 0.5
}`}</code>
        </pre>
      </section>

      {/* Closing CTA */}
      <section className="mt-28 border-t border-slate-800 pt-12">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              Two clicks. $0. Your reviewers get their evenings back.
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Public GitHub App, or self-host the whole stack on free tiers.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <a
              href="https://github.com/apps/vouch-review"
              className="inline-flex items-center rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
            >
              Install Vouch
            </a>
            <a
              href="https://github.com/0-uddeshya-0/Vouch"
              className="inline-flex items-center rounded-lg border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500"
            >
              Read the source
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
