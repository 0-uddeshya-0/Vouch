import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { isDemoMode } from '@/lib/demo-mode';

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Registry verification',
    body: 'Every import and manifest entry is checked against live npm and PyPI registries. Hallucinated packages are caught before anyone runs npm install.',
  },
  {
    step: '02',
    title: 'Secrets & CVE scan',
    body: 'Added lines are scanned for credential formats (AWS, GitHub, Stripe, private keys) and new dependencies are batch-checked against the OSV vulnerability database.',
  },
  {
    step: '03',
    title: 'Slop detection',
    body: 'Redundant HTTP clients, packages with native replacements, and dependencies that are declared but never imported get flagged — deterministically, no LLM opinions.',
  },
  {
    step: '04',
    title: 'Optional AI escalation',
    body: 'Logic flaws the static pass cannot see go to a local Ollama model (free) or Anthropic Haiku→Sonnet. LLM failures never block your PR.',
  },
];

export default async function Home() {
  const session = await getServerSession(authOptions);
  const demo = isDemoMode();
  const canViewFindings = Boolean(session) || demo;

  return (
    <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="animate-fade-up text-center">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-900/80 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Deterministic-first PR review
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
          The AI code reviewer that{' '}
          <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            doesn&rsquo;t trust AI
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400">
          Copilot-era pull requests ship hallucinated packages, hardcoded keys, and dependency
          bloat. Vouch catches them with registry lookups, CVE databases, and AST parsing —
          evidence, not another model&rsquo;s opinion.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {canViewFindings ? (
            <Link
              href="/findings"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
            >
              View findings
              <span aria-hidden>→</span>
            </Link>
          ) : (
            <Link
              href="/api/auth/signin?callbackUrl=/findings"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
            >
              Sign in with GitHub
            </Link>
          )}
          <a
            href="https://github.com/0-uddeshya-0/Vouch"
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
          >
            README & setup
          </a>
        </div>

        {demo && (
          <p className="mt-4 text-xs text-amber-400/90">
            Demo mode is on — findings are open without sign-in (development only).
          </p>
        )}
        {session && (
          <p className="mt-4 text-xs text-slate-500">
            Signed in as{' '}
            <span className="font-mono text-slate-400">
              {session.user?.login ?? session.user?.name}
            </span>
          </p>
        )}
      </div>

      {/* Pipeline */}
      <div className="mt-20">
        <h2 className="text-center text-sm font-medium uppercase tracking-widest text-slate-500">
          What runs on every pull request
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PIPELINE_STEPS.map((item, index) => (
            <div
              key={item.step}
              className="animate-fade-up rounded-xl border border-slate-800 bg-slate-900/40 p-6 transition hover:border-slate-700 hover:bg-slate-900/70"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <p className="font-mono text-xs text-emerald-500">{item.step}</p>
              <h3 className="mt-2 text-base font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Example */}
      <div className="animate-fade-up mt-16 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-sm font-medium uppercase tracking-widest text-slate-500">
          What it looks like
        </h2>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-sm leading-relaxed">
          <code>
            <span className="text-red-400">- import retry from &apos;axios-retry-pro&apos;;</span>
            <span className="text-slate-600">   // 👻 not on npm — hallucinated</span>
            {'\n'}
            <span className="text-emerald-400">+ import retry from &apos;axios-retry&apos;;</span>
            {'\n\n'}
            <span className="text-red-400">- const key = &apos;AKIA2E4XQJ7VHZ93KQLM&apos;;</span>
            <span className="text-slate-600">  // 🔑 AWS key in the diff</span>
            {'\n'}
            <span className="text-emerald-400">+ const key = process.env.AWS_ACCESS_KEY_ID;</span>
          </code>
        </pre>
        <p className="mt-4 text-sm text-slate-500">
          Findings land as a GitHub check run and a single, continuously-updated PR comment — then
          flow here for triage and one-click dismissal.
        </p>
      </div>
    </div>
  );
}
