<div align="center">

<h1>Vouch</h1>

<strong>The AI code reviewer that doesn&rsquo;t trust AI.</strong>

Catches hallucinated packages, leaked secrets, known CVEs, and dependency bloat on every pull request —
with deterministic registry lookups and AST parsing, not another model&rsquo;s guess.

<br />

[![CI](https://img.shields.io/github/actions/workflow/status/0-uddeshya-0/Vouch/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/0-uddeshya-0/Vouch/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-74%20passing-success?style=flat-square)](packages/core/src/__tests__)
[![Cost](https://img.shields.io/badge/runs%20on-free%20tier-22c55e?style=flat-square)](render.yaml)

[Try it](#-try-it-in-3-ways) ·
[Deploy free](#-deploy-your-own-free) ·
[How it works](#-how-it-works) ·
[Configuration](#%EF%B8%8F-configuration) ·
[Contributing](CONTRIBUTING.md)

</div>

---

## Why Vouch?

AI assistants now write a large share of the code in every PR — and the surveys are blunt about the cost: **96% of developers don't fully trust AI-generated code, and reviewing it takes *more* effort than reviewing a human's.** The failure mode isn't obvious typos; it's code that *looks* right and quietly isn't:

```diff
- import retry from 'axios-retry-pro';    // 👻 package does not exist on npm (slopsquatting bait)
+ import retry from 'axios-retry';

- const key = 'AKIA2E4XQJ7VHZ93KQLM';     // 🔑 hardcoded AWS credential, now in git history forever
+ const key = process.env.AWS_ACCESS_KEY_ID;
```

Vouch sits on your pull requests like a skeptical senior engineer. **The checks that matter are deterministic** — a package either exists on the registry or it doesn't; a version either has a CVE or it doesn't. LLM analysis is *optional* and never blocks a merge. Every finding ships with evidence you can verify yourself, not a confidence-shaped opinion.

| | Catches | How |
|---|---|---|
| 👻 | **Hallucinated / slopsquatted packages** | Live npm & PyPI registry lookups — a definitive 404, never a guess |
| 🔑 | **Committed secrets** | 12 credential formats (AWS, GitHub, Stripe, Slack, private keys…) + entropy heuristics |
| 🛡️ | **Known CVEs** | Batch-queries the [OSV](https://osv.dev) database for every added dependency |
| 🧹 | **Dependency slop** | Redundant HTTP clients, native-replaceable packages, declared-but-unused deps |
| 🧠 | **Logic flaws** *(optional)* | Local Ollama (free) or Anthropic Haiku→Sonnet — failures degrade gracefully |

---

## 🚀 Try it in 3 ways

### 1. Install the GitHub App on your repo (zero setup)

If a Vouch instance is already running, installing it is two clicks — no code, no deploy:

> **`https://github.com/apps/<your-app-slug>`** → *Install* → pick a repo → open a PR.

That's the link you share with teammates and friends. Vouch comments on their PRs within seconds; they host nothing. *(Create the app and get your slug in [Deploy your own](#-deploy-your-own-free).)*

### 2. See it locally in 90 seconds (no GitHub App needed)

Runs the **real** pipeline — live registry lookups, the OSV CVE database, the secrets scanner — against a fixture PR full of typical AI mistakes, then opens a styled dashboard:

```bash
pnpm install

# throwaway Postgres (skip if you already have one on DATABASE_URL)
docker run -d --name vouch-demo-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=vouch -p 5433:5432 postgres:15-alpine
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/vouch?schema=public"
npx prisma migrate deploy

pnpm demo                                              # analyze + seed the dashboard
DASHBOARD_DEMO_MODE=true pnpm --filter @vouch/dashboard dev   # → http://localhost:3002/findings
```

No database handy? `pnpm demo --no-db` prints the analysis and writes the exact PR comment to `scripts/demo/pr-comment-preview.md`.

### 3. Self-host the whole thing

Free-tier deploy in [the section below](#-deploy-your-own-free), or run the full stack locally — see [Local development](#-local-development).

---

## 🆓 Deploy your own (free)

Vouch is designed to cost **nothing** to run: the backend ships an **all-in-one mode** (webhook server + analysis worker in one process) and a **`deterministic` mode** that needs no LLM, no API key, and no GPU. The whole stack fits on permanently-free tiers.

| Piece | Free host | Notes |
|-------|-----------|-------|
| Backend (API + worker) | **Render** free web service | One service via [`render.yaml`](render.yaml) |
| Dashboard | **Vercel** Hobby | [`apps/dashboard/vercel.json`](apps/dashboard/vercel.json) |
| Postgres | **Neon** free | paste `DATABASE_URL` |
| Redis | **Upstash** free | paste the `rediss://` `REDIS_URL` |

**Steps:**

1. **Create the GitHub App** (one browser approval — no manual permission clicking):
   ```bash
   node scripts/github-app/create-github-app.mjs https://<your-render-app>.onrender.com/webhooks/github
   ```
   This writes your App ID, private key, and webhook secret to a ready-to-paste `.env` block, and prints your public install link.
2. **Backend → Render:** New ＋ → *Blueprint* → pick this repo. Render reads `render.yaml` and prompts for the env values from step 1 plus your Neon/Upstash URLs.
3. **Dashboard → Vercel:** import the repo, root `apps/dashboard`, add `DATABASE_URL`, `NEXTAUTH_*`, `GITHUB_ID/SECRET`, and `DASHBOARD_ALLOWED_LOGINS`.
4. **Install** the app on your repos and share the public link. Done.

Full walkthrough (incl. a paid Railway one-click option): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 🔍 How it works

Every pull request triggers a multi-stage pipeline. Deterministic analysis always runs; the LLM is optional icing that can never block a merge.

```mermaid
flowchart LR
  GH[GitHub PR] --> WH[Webhook API]
  WH -->|HMAC verified, deduped| Q[(Redis / BullMQ)]
  Q --> W[Analysis Worker]

  W --> D[Deterministic pass]
  D -->|registry · secrets · slop| M[Merge findings]
  M --> O[OSV CVE scan] --> M
  M --> L{LLM escalation?}
  L -->|deterministic| M
  L -->|zero-cost| OL[Ollama] --> M
  L -->|full| AI[Haiku → Sonnet] --> M

  M --> CR[Check run]
  M --> CM[PR comment]
  M --> DB[(PostgreSQL)] --> DASH[Dashboard]
```

1. **Webhook** — Fastify verifies the GitHub HMAC signature (constant-time) and deduplicates deliveries in Redis.
2. **Queue** — BullMQ enqueues the job so the webhook returns in milliseconds.
3. **Deterministic pass** — TypeScript-compiler & tree-sitter import extraction, npm/PyPI verification, secret + entropy scanning, dependency-quality heuristics.
4. **OSV pass** — batch CVE lookup for every added dependency, aggregated to one finding per package.
5. **LLM escalation** *(optional)* — SQL injection, unsafe `eval`, auth bypass; failures are swallowed.
6. **Output** — a GitHub check run and a single, continuously-updated PR comment, plus rows in the triage dashboard.

---

## ⚙️ Configuration

### Analysis modes (`VOUCH_MODE`)

| Mode | LLM | Needs | Cost |
|------|-----|-------|------|
| `deterministic` *(default)* | none | nothing | **$0** |
| `zero-cost` | local Ollama | an Ollama instance | $0 |
| `full` | Anthropic Haiku → Sonnet | `ANTHROPIC_API_KEY` | ~pennies/PR |

### Per-repository `vouch.json`

Drop a `vouch.json` in any repo to tune analysis (fetched per-PR, cached 5 min). Invalid config falls back to defaults — analysis never fails because of it.

```json
{
  "ignoreScopes": ["@mycompany"],
  "ignoreDependencies": ["legacy-logger"],
  "slopThreshold": 0.5
}
```

### Key environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL`, `REDIS_URL` | Postgres + Redis connections |
| `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | GitHub App auth |
| `VOUCH_MODE` | `deterministic` / `zero-cost` / `full` |
| `VOUCH_DASHBOARD_URL` | base URL for "View details" links in PR comments |
| `DASHBOARD_ALLOWED_LOGINS` | GitHub logins allowed into the dashboard — **required in production** |
| `ADMIN_API_TOKEN` | enables the `/api/v1` admin API (disabled when unset) |

See [`.env.example`](.env.example) and [`.env.production.example`](.env.production.example) for the full list.

---

## 🧑‍💻 Local development

```bash
# Node 20+, pnpm 9+, Docker
pnpm install
docker compose -f infra/docker/docker-compose.dev.yml up -d db redis
npx prisma migrate dev
pnpm dev            # API + worker + dashboard via Turborepo

pnpm --filter @vouch/core test    # 74 tests
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

---

## 📦 Project structure

```
apps/
  api/         # Fastify webhook server + BullMQ worker (+ all-in-one & demo entries)
  dashboard/   # Next.js 14 triage UI
packages/
  core/        # Analyzers, registry clients, OSV scanner, LLM router, formatters
  config/      # Zod-validated env (fail-fast on boot)
  types/       # Shared TypeScript types
prisma/        # Database schema + migrations
infra/docker/  # Compose files (prod, dev, Ollama)
render.yaml    # Free single-service backend blueprint
```

---

## License

MIT — see [LICENSE](LICENSE).

<div align="center">
<sub>Built for teams who love AI-assisted coding but refuse to trust it blindly.</sub><br />
<sub>⭐ Star it · 🐛 <a href="https://github.com/0-uddeshya-0/Vouch/issues">Report an issue</a> · 🤝 <a href="CONTRIBUTING.md">Contribute</a></sub>
</div>
