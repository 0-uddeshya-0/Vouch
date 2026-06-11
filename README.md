<div align="center">

<img src="docs/assets/banner.svg" alt="Vouch — the AI code reviewer that doesn't trust AI" width="880" />

<br /><br />

[![CI](https://img.shields.io/github/actions/workflow/status/0-uddeshya-0/Vouch/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/0-uddeshya-0/Vouch/actions)
[![Install the App](https://img.shields.io/badge/GitHub%20App-install%20vouch--review-34d399?style=flat-square&logo=github)](https://github.com/apps/vouch-review)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-90%20passing-success?style=flat-square)](packages/core/src/__tests__)
[![Runs free](https://img.shields.io/badge/infra%20cost-%240%2Fmonth-22c55e?style=flat-square)](docs/DEPLOYMENT.md)

**[Install on your repo](https://github.com/apps/vouch-review)** ·
**[See a live analysis](https://github.com/0-uddeshya-0/Vouch/pull/3)** ·
[90-second local demo](#-try-it-in-90-seconds) ·
[Deploy your own (free)](#-deploy-your-own-free) ·
[Architecture](docs/ARCHITECTURE.md)

</div>

---

## The problem

AI assistants now write a large share of the code in every pull request, and
**19.7% of packages recommended by LLMs don't exist** ([USENIX Security 2025](https://www.usenix.org/conference/usenixsecurity25)).
Attackers register those hallucinated names on npm and PyPI — *slopsquatting* —
and wait for someone to `npm install` the suggestion. Add hardcoded keys, CVE-pinned
versions, and three HTTP clients doing one job, and "looks right, isn't" becomes
the dominant failure mode of AI-era code review.

Vouch sits on your pull requests like a skeptical senior engineer. **The checks
that matter are deterministic** — a package either exists on the registry or it
doesn't; a version either has a CVE or it doesn't. Every finding ships with
evidence you can verify in one click, not a confidence-shaped opinion. LLM
analysis is optional, runs last, and can never block a merge.

| | Catches | Evidence |
|---|---|---|
| 👻 | **Hallucinated / slopsquatted packages** | live npm & PyPI lookup — a definitive 404 |
| 🔑 | **Committed secrets** | 12 credential formats + entropy, with placeholder filtering |
| 🛡️ | **Known CVEs** | [OSV](https://osv.dev) advisory IDs, aggregated per package |
| 🧹 | **Dependency slop** | redundant clients, native replacements, declared-but-unused |
| 🧠 | **Logic flaws** *(opt-in)* | local Ollama (free) or Anthropic Haiku→Sonnet |

## What it looks like

This is a real analysis from the live instance — [see it on the PR](https://github.com/0-uddeshya-0/Vouch/pull/3):

<div align="center">
<img src="docs/assets/pr-comment.png" alt="Vouch PR comment showing a hallucinated package and lodash CVEs" width="760" />
</div>

One comment per PR, updated in place on every push — never a wall of stacked
bot comments. Zero findings means zero comments. Findings flow into a triage
dashboard with one-click dismissal:

<div align="center">
<img src="docs/assets/dashboard-findings.png" alt="Vouch dashboard with severity stats and findings table" width="760" />
</div>

## 🚀 Try it in 90 seconds

**Fastest:** if a Vouch instance is running (like the live one), installing is two clicks —
**[github.com/apps/vouch-review](https://github.com/apps/vouch-review)** → Install → open a PR. You host nothing.

**Locally, no GitHub App needed** — runs the *real* pipeline (live registry
lookups, OSV, secrets scanner) against a fixture PR full of AI-assistant mistakes:

```bash
pnpm install

# throwaway Postgres (skip if you have one on DATABASE_URL)
docker run -d --name vouch-demo-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=vouch -p 5433:5432 postgres:15-alpine
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/vouch?schema=public"
npx prisma migrate deploy

pnpm demo                                                     # analyze + seed
DASHBOARD_DEMO_MODE=true pnpm --filter @vouch/dashboard dev   # → localhost:3002/findings
```

No database handy? `pnpm demo --no-db` prints the analysis and writes the exact
PR comment markdown to `scripts/demo/pr-comment-preview.md`.

## 🆓 Deploy your own (free)

The whole stack runs on permanent free tiers — **$0/month**, no credit card:
the backend ships an all-in-one mode (webhook server + worker in one process)
and a `deterministic` analysis mode that needs no LLM, no API key, no GPU.

| Piece | Free host |
|-------|-----------|
| Backend (API + worker) | **Render** free web service — one [`render.yaml`](render.yaml) blueprint |
| Redis | **Render** free Key Value — declared in the blueprint, wired automatically |
| Postgres | **Neon** free |
| Dashboard | **Vercel** Hobby |

```bash
# 1. Create your GitHub App (one browser approval — correct permissions included)
node scripts/github-app/create-github-app.mjs https://<your-app>.onrender.com/webhooks/github

# 2. Render: New + → Blueprint → pick your fork. Paste the env values when prompted.
# 3. Vercel: import the repo, root apps/dashboard, set the dashboard env vars.
# 4. Install your app, share your install link. Done.
```

Step-by-step walkthrough: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** ·
Day-2 runbook: **[docs/OPERATIONS.md](docs/OPERATIONS.md)**

## 🔍 How it works

```mermaid
flowchart LR
  GH[GitHub PR] --> WH[Webhook API]
  WH -->|HMAC verified, deduped| Q[(Redis / BullMQ)]
  Q --> W[Analysis Worker]
  W --> D[Deterministic pass]
  D -->|registries · secrets · slop| M[Findings]
  M --> O[OSV CVE scan] --> M
  M --> L{LLM?}
  L -->|deterministic| M
  L -->|zero-cost / full| AI[Ollama / Haiku→Sonnet] --> M
  M --> CR[Check run]
  M --> CM[PR comment]
  M --> DB[(PostgreSQL)] --> DASH[Dashboard]
```

The webhook verifies and enqueues in milliseconds; the worker analyzes only the
PR diff (repos are **never cloned**), checks every import and manifest entry
against live registries, scans for secrets, batch-queries OSV, and posts a
check run + a single self-updating comment. Registry outages can't produce
false positives (404 is proof; a network error is "unknown") and LLM failures
can't block a merge. Full detail: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## ⚙️ Configuration

**Analysis modes** (`VOUCH_MODE`): `deterministic` *(default, $0)* ·
`zero-cost` *(local Ollama)* · `full` *(Anthropic Haiku→Sonnet, ~cents/PR)*.

**Per-repo tuning** — drop a `vouch.json` in any repo root (fetched per-PR,
cached, invalid config falls back to defaults):

```json
{
  "ignoreScopes": ["@mycompany"],
  "ignoreDependencies": ["legacy-logger"],
  "slopThreshold": 0.5
}
```

**Key environment variables** — see [`.env.example`](.env.example) for all:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` / `REDIS_URL` | Postgres + Redis |
| `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET` | GitHub App auth |
| `VOUCH_DASHBOARD_URL` | base URL for PR-comment detail links |
| `DASHBOARD_ALLOWED_LOGINS` | dashboard allowlist — **required in production** |
| `ADMIN_API_TOKEN` | enables `/api/v1` admin API (off when unset) |

## 🧑‍💻 Development

```bash
# Node 20+, pnpm 9+, Docker
pnpm install
docker compose -f infra/docker/docker-compose.dev.yml up -d db redis
npx prisma migrate dev
pnpm dev                          # API + worker + dashboard

pnpm --filter @vouch/core test    # 90 tests
pnpm build && pnpm typecheck
```

```
apps/api          Fastify webhooks + BullMQ worker (+ all-in-one & demo entries)
apps/dashboard    Next.js 14 triage UI
packages/core     Analyzers, registry clients, OSV, LLM router, formatters
packages/config   Zod-validated env (fail fast at boot)
packages/types    Shared types
prisma/           Schema + migrations
render.yaml       Free one-service backend blueprint
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

<div align="center">
<sub>Built for teams who love AI-assisted coding but refuse to trust it blindly.</sub><br/>
<sub>⭐ <a href="https://github.com/0-uddeshya-0/Vouch">Star the repo</a> · 🤖 <a href="https://github.com/apps/vouch-review">Install the app</a> · 🐛 <a href="https://github.com/0-uddeshya-0/Vouch/issues">Report an issue</a></sub>
</div>
