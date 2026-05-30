<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/0-uddeshya-0/Vouch/ci.yml?branch=main&label=CI&style=flat-square" alt="CI" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/pnpm-monorepo-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

<h1 align="center">Vouch</h1>

<p align="center">
  <strong>An AI-powered PR reviewer that doesn't trust AI.</strong><br />
  Vouch uses deterministic AST parsing, live registry lookups, and OSV CVE scanning to catch hallucinated packages, secrets, and AI-generated bloat before they merge.
</p>

<p align="center">
  <a href="#getting-started">Quick Start</a> ·
  <a href="#how-it-works">Architecture</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#development">Development</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## Why Vouch?

Copilot, Cursor, and ChatGPT write code that *looks* right — until you `npm install` a package that doesn't exist, ship a hardcoded API key, or merge three HTTP clients doing the same job.

Vouch sits on your GitHub pull requests like a skeptical senior engineer: **deterministic checks run first**, CVE databases are queried, and only then does optional LLM escalation kick in for logical flaws the static analysis missed.

```diff
- import { utils } from 'lodash-pro';     // 👻 package does not exist on npm
+ import { utils } from 'lodash';

- const key = 'AKIAIOSFODNN7EXAMPLE';     // 🔑 hardcoded AWS credential
+ const key = process.env.AWS_ACCESS_KEY;
```

When Vouch finds issues, it posts a structured GitHub comment with alert blocks, severity tables, and links to the triage dashboard — not a wall of noise.

---

## Key Features

| | Feature | What it does |
|---|---|---|
| 🕵️ | **The Slop Detector** | Flags redundant dependency overlap (lodash + ramda), native alternatives (`uuid` → `crypto.randomUUID`), and unused packages added to `package.json` but never imported in the PR. |
| 🛡️ | **Zero-Hallucination SCA** | Verifies every npm/PyPI import against live registries. Batches declared dependencies through the [OSV API](https://osv.dev) for known CVEs. No phantom packages slip through. |
| 🧠 | **Hybrid AI Escalation** | **Zero-Cost Mode** routes analysis to local [Ollama](https://ollama.ai). **Full Mode** uses Anthropic Haiku for a fast pass, escalating low-confidence findings to Sonnet for deep review. LLM failures never block the PR check. |
| 📊 | **Next.js Triage Dashboard** | Built-in dashboard at `/findings` with GitHub OAuth, severity filters, and one-click dismissal — so your team can kill false positives without losing signal. |

---

## How It Works

Every pull request triggers a multi-stage pipeline. Deterministic analysis always runs; LLM is optional icing.

```mermaid
flowchart LR
  GH[GitHub PR opened] --> WH[Webhook API]
  WH --> Q[(Redis / BullMQ)]
  Q --> W[Analysis Worker]

  W --> D[Deterministic Pass]
  D --> |AST imports · secrets · registry lookup · slop detector| M[Merge Findings]

  M --> O[OSV CVE Scan]
  O --> M

  M --> L{LLM Escalation}
  L --> |zero-cost| OL[Ollama]
  L --> |full| AI[Haiku → Sonnet]
  OL --> M
  AI --> M

  M --> CR[GitHub Check Run]
  M --> CM[PR Comment]
  M --> DB[(PostgreSQL)]
  DB --> DASH[Dashboard /findings]
```

**Stage by stage:**

1. **GitHub Webhook** — Fastify receives `pull_request` events, verifies HMAC signatures, deduplicates via Redis.
2. **Redis Queue** — BullMQ enqueues analysis jobs so webhooks return in milliseconds.
3. **Deterministic Pass** — Tree-sitter AST parsing, secret/entropy scanners, npm/PyPI registry verification, dependency quality heuristics.
4. **OSV Pass** — Batch-queries [osv.dev](https://osv.dev) for CVEs in added dependencies.
5. **LLM Escalation** — Optional Haiku/Ollama pass for SQL injection, unsafe `eval`, and logic bugs; Sonnet for escalated snippets.
6. **PR Comment + Check Run** — Formatted Markdown with GitHub alert syntax (`> [!WARNING]`), truncated tables, EU AI Act disclosure footer. No comment posted if zero findings.

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- A [GitHub App](https://docs.github.com/en/apps/creating-github-apps) (or use dev mode with ngrok)
- **Optional:** [Ollama](https://ollama.ai) for zero-cost LLM mode · Anthropic API key for full mode

### 1. Clone & configure

```bash
git clone https://github.com/0-uddeshya-0/Vouch.git
cd Vouch
cp .env.example .env
```

Edit `.env` with your GitHub App credentials (see step 3).

### 2. Start with Docker Compose

```bash
cd infra/docker
docker compose up -d db redis api worker
```

| Service | URL |
|---------|-----|
| API (webhooks) | `http://localhost:3000` |
| Health check | `http://localhost:3000/health` |

**Zero-cost LLM mode** (local Ollama, no API keys):

```bash
docker compose --profile airgap up -d   # starts Ollama alongside core services
```

Set in your `.env`:

```bash
VOUCH_MODE=zero-cost
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=codellama:7b-code
```

**Full cloud LLM mode** (Anthropic Haiku → Sonnet escalation):

```bash
VOUCH_MODE=full
ANTHROPIC_API_KEY=sk-ant-...
```

Run database migrations:

```bash
cd ../..   # back to repo root
npx prisma migrate deploy
```

### 3. Create a GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Set **Webhook URL** to `https://<your-host>/webhooks/github`
3. Set **Webhook secret** → copy to `GITHUB_WEBHOOK_SECRET` in `.env`
4. Enable permissions:
   - **Pull requests** — Read & write (for comments & check runs)
   - **Contents** — Read (for diffs & config files)
   - **Metadata** — Read
5. Subscribe to events: **Pull request**, **Installation**, **Installation repositories**
6. Generate a **private key** → paste into `GITHUB_PRIVATE_KEY` (keep `\n` newlines)
7. Note the **App ID** → `GITHUB_APP_ID`
8. Install the app on your org/repos

### 4. Start the dashboard (optional)

For the triage UI, create a separate **GitHub OAuth App** and add to `.env`:

```bash
NEXTAUTH_URL=http://localhost:3002
NEXTAUTH_SECRET=<random-32+-char-string>
GITHUB_ID=<oauth-app-client-id>
GITHUB_SECRET=<oauth-app-client-secret>
VOUCH_DASHBOARD_URL=http://localhost:3002
```

```bash
pnpm install
pnpm --filter @vouch/dashboard dev
```

Open [http://localhost:3002/findings](http://localhost:3002/findings).

---

## Configuration

### Environment variables

<details>
<summary><strong>API & Worker (required)</strong></summary>

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | GitHub App PEM private key |
| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC secret |

</details>

<details>
<summary><strong>LLM modes</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `VOUCH_MODE` | `zero-cost` | `zero-cost` (Ollama) or `full` (Anthropic) |
| `ANTHROPIC_API_KEY` | — | Required when `VOUCH_MODE=full` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `codellama:7b-code` | Model tag for zero-cost mode |
| `LLM_CONFIDENCE_THRESHOLD` | `0.7` | Confidence bar for LLM findings |

</details>

<details>
<summary><strong>Dashboard (optional)</strong></summary>

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` | Dashboard URL (e.g. `http://localhost:3002`) |
| `NEXTAUTH_SECRET` | Session encryption secret (32+ chars) |
| `GITHUB_ID` / `GITHUB_SECRET` | OAuth App credentials |
| `VOUCH_DASHBOARD_URL` | Base URL embedded in PR comment links |

</details>

See [`.env.example`](.env.example) for the full list.

### Per-repository `vouch.json`

Drop a `vouch.json` (or `.vouchrc.json`) in your repo root to tune analysis per-project. Vouch fetches it automatically on each PR (cached for 5 minutes).

```json
{
  "ignoreScopes": ["@mycompany", "@internal"],
  "ignoreDependencies": ["legacy-logger", "internal-utils"],
  "slopThreshold": 0.5
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ignoreScopes` | `string[]` | `[]` | Skip npm scoped packages (e.g. private `@mycompany/*` packages) |
| `ignoreDependencies` | `string[]` | `[]` | Skip specific package names from registry/CVE/slop checks |
| `slopThreshold` | `number` | `0.5` | Minimum severity (0–1) to report dependency quality findings. Higher = fewer low-priority nags. |

Missing or invalid config files fall back to defaults — analysis never fails because of config.

---

## Project Structure

```
Vouch/
├── apps/
│   ├── api/          # Fastify webhook server + BullMQ worker
│   └── dashboard/    # Next.js 14 triage UI
├── packages/
│   ├── core/         # Analyzers, LLM router, OSV scanner, formatters
│   ├── config/       # Zod env validation (fail-fast on boot)
│   └── types/        # Shared TypeScript types
├── prisma/           # Database schema
└── infra/docker/     # Docker Compose (prod + dev)
```

---

## Development

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker
pnpm install

# Start Postgres + Redis
docker compose -f infra/docker/docker-compose.dev.yml up -d db redis

# Migrate & run
npx prisma migrate dev
pnpm dev          # API + worker + dashboard via Turborepo

# Test & build
pnpm --filter @vouch/core test
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

---

## What Vouch catches (examples)

| Category | Example | Detection method |
|----------|---------|-------------------|
| Hallucinated package | `import x from 'expresss'` | Live npm registry lookup |
| Known CVE | `lodash@4.17.15` | OSV batch API |
| Hardcoded secret | `AKIA...` in diff | Pattern + entropy scanner |
| Unused dependency | `left-pad` added, never imported | Slop detector |
| Redundant deps | `axios` + `node-fetch` + `got` | Overlap heuristics |
| Logical flaw | SQL string concatenation | LLM escalation (optional) |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built for teams who love AI-assisted coding but refuse to trust it blindly.</sub><br />
  <sub>⭐ Star us on GitHub · 🐛 <a href="https://github.com/0-uddeshya-0/Vouch/issues">Report an issue</a> · 🤝 <a href="CONTRIBUTING.md">Contribute</a></sub>
</p>
