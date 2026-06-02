# Vouch Production Deployment Guide

Deploy Vouch in ~45 minutes using free tiers: **Supabase** (Postgres) + **Upstash** (Redis) + **Railway** (API + Worker) + **Vercel** (Dashboard).

Replace `your-api.up.railway.app` and `your-dashboard.vercel.app` with your real URLs throughout.

---

## Architecture overview

| Component | Platform | URL |
|-----------|----------|-----|
| PostgreSQL | Supabase / Neon / Railway | `DATABASE_URL` |
| Redis | Upstash | `REDIS_URL` |
| API (webhooks) | Railway service #1 | `https://your-api.up.railway.app` |
| Worker (analysis) | Railway service #2 | (no public URL) |
| Dashboard | Vercel | `https://your-dashboard.vercel.app` |
| GitHub App | github.com/settings/apps | Webhook → API |

---

## Step 1 — Database (Supabase, free)

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → Database → Connection string → URI**.
3. Copy the **Transaction pooler** or **Direct** connection string (use `?sslmode=require` for production).
4. Save as `DATABASE_URL`:

```bash
DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

5. From your laptop (repo root), push the schema:

```bash
cp .env.example .env
# paste DATABASE_URL into .env
pnpm install
pnpm db:push
```

You should see: `Your database is now in sync with your Prisma schema`.

---

## Step 2 — Redis (Upstash, free)

1. Create a database at [console.upstash.com](https://console.upstash.com).
2. Copy the **Redis URL** (TLS — starts with `rediss://`).
3. Save as `REDIS_URL`:

```bash
REDIS_URL=rediss://default:AbC...@us1-xxx.upstash.io:6379
```

> BullMQ works with Upstash when using the TLS URL. No extra config needed.

---

## Step 3 — Deploy API + Worker (Railway)

### 3a. Create project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select `Vouch`.
2. Railway detects the root `Dockerfile`.

### 3b. Service: `vouch-api`

| Setting | Value |
|---------|-------|
| **Service name** | `vouch-api` |
| **Builder** | Dockerfile |
| **Start command** | `node apps/api/dist/server.js` (default from Dockerfile) |
| **Health check path** | `/health` |
| **Port** | `3000` |

**Variables** (Settings → Variables — paste from `.env.production.example`):

```
DATABASE_URL=...
REDIS_URL=...
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY=...   # paste full PEM; Railway supports multiline
GITHUB_WEBHOOK_SECRET=...
VOUCH_MODE=zero-cost       # or full + ANTHROPIC_API_KEY
VOUCH_DASHBOARD_URL=https://your-dashboard.vercel.app
NODE_ENV=production
```

Generate a public domain: **Settings → Networking → Generate Domain** → e.g. `vouch-api-production.up.railway.app`.

Verify:

```bash
curl https://your-api.up.railway.app/health
# {"status":"ok",...}
```

### 3c. Service: `vouch-worker` (same repo, second service)

1. In the same Railway project: **+ New Service** → **GitHub Repo** → same repository.
2. Use the **same Dockerfile**.
3. Override **Start command**:

```
node apps/api/dist/worker.js
```

4. Copy the **same environment variables** as `vouch-api` (worker needs DB, Redis, GitHub, LLM vars).
5. **Do not** expose a public port on the worker.

Deploy both services. Check **Deploy Logs** for:

```
Analysis worker started
```

---

## Step 4 — Dashboard (Vercel)

1. [vercel.com](https://vercel.com) → **Add New Project** → import `Vouch` repo.
2. **Root Directory:** `apps/dashboard`
3. Framework: **Next.js** (auto-detected; `vercel.json` supplies build commands).
4. **Environment variables:**

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Same Supabase URL as API |
| `NEXTAUTH_URL` | `https://your-project.vercel.app` (set after first deploy, then redeploy) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GITHUB_ID` | OAuth App Client ID (see Step 5b) |
| `GITHUB_SECRET` | OAuth App Client Secret |
| `NODE_ENV` | `production` |

5. Deploy. Copy the production URL → update `NEXTAUTH_URL` and `VOUCH_DASHBOARD_URL` on **Railway** → redeploy API + worker.

Open `https://your-dashboard.vercel.app/findings` and sign in with GitHub.

---

## Step 5 — GitHub App (production)

### 5a. Create the GitHub App

1. [github.com/settings/apps/new](https://github.com/settings/apps/new)

| Field | Value |
|-------|-------|
| **GitHub App name** | `Vouch` (or `Vouch Dev`) |
| **Homepage URL** | Your repo or `https://github.com/0-uddeshya-0/Vouch` |
| **Webhook URL** | `https://your-api.up.railway.app/webhooks/github` |
| **Webhook secret** | Same as `GITHUB_WEBHOOK_SECRET` in Railway |
| **Active** | Yes |

**Permissions:**

| Permission | Access |
|------------|--------|
| Pull requests | Read & write |
| Contents | Read |
| Checks | Read & write |
| Issues | Read & write |
| Metadata | Read |

**Subscribe to events:**

- [x] Pull request
- [x] Installation
- [x] Installation repositories

2. **Create GitHub App**
3. Note **App ID** → `GITHUB_APP_ID`
4. **Generate a private key** → download PEM → `GITHUB_PRIVATE_KEY` (escape newlines as `\n` or use Railway multiline editor)
5. **Install App** → choose your account/org → select **Vouch** repository (dogfood!)

### 5b. OAuth App (dashboard login only)

Separate from the GitHub App:

1. [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New**
2. **Authorization callback URL:** `https://your-dashboard.vercel.app/api/auth/callback/github`
3. Copy **Client ID** → `GITHUB_ID`, **Client secret** → `GITHUB_SECRET` (Vercel env vars)

---

## Step 6 — Dogfood on your repo

Prove production works with a intentional bad PR.

### Option A — Script (from repo root)

```bash
./scripts/dogfood/create-dogfood-pr.sh
```

Then open GitHub and create a PR from the pushed branch.

### Option B — Manual

1. Create branch:

```bash
git checkout -b dogfood/vouch-production-test
```

2. Edit `apps/api/package.json` — add to `"dependencies"`:

```json
"express-auth-slop": "^1.0.0",
"lodash": "^4.17.21"
```

3. Do **not** add any `import` from `lodash` in code changes.

4. Commit, push, open PR against `main`.

### Expected results (within ~30s of opening PR)

| Finding | Why |
|---------|-----|
| Hallucination / registry | `express-auth-slop` does not exist on npm |
| Slop / unused dep | `lodash` added but not imported in PR diff |
| Check run | **Action required** if security/hallination; **Neutral** if only slop |
| PR comment | Markdown tables, `> [!WARNING]`, link to dashboard |
| Dashboard | Findings visible at `/findings?pr=<number>` |

### Screenshot for marketing

Capture the GitHub PR comment showing:

- **Security & Hallucinations** section with `express-auth-slop`
- **Dependency Quality** section with `lodash`
- Footer with AI disclosure and dashboard link

---

## Step 7 — Optional `vouch.json` in your repo

Add to repository root to ignore private packages later:

```json
{
  "ignoreScopes": ["@yourorg"],
  "slopThreshold": 0.5
}
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Webhook 401/403 | Verify `GITHUB_WEBHOOK_SECRET` matches GitHub App settings |
| Worker not analyzing | Check worker service logs; confirm `REDIS_URL` is `rediss://` for Upstash |
| No PR comment | Zero findings = no comment (by design). Check worker logs for errors |
| Dashboard 500 on login | `NEXTAUTH_URL` must exactly match Vercel URL; callback URL on OAuth App |
| Prisma errors on Vercel | `DATABASE_URL` must be set; redeploy after adding vars |
| LLM skipped | `VOUCH_MODE=zero-cost` without Ollama → deterministic-only (still works) |

---

## Cost estimate (free tier)

| Service | Free tier |
|---------|-----------|
| Supabase | 500 MB DB |
| Upstash | 10k commands/day |
| Railway | $5 credit/month |
| Vercel | Hobby tier |

**Total for dogfooding:** $0 if you stay within limits.

---

## Quick reference — all production URLs

```bash
# Health
curl https://YOUR_API_URL/health

# Webhook (GitHub only)
POST https://YOUR_API_URL/webhooks/github

# Dashboard
https://YOUR_DASHBOARD_URL/findings
```

After dogfooding succeeds, add your PR comment screenshot to the README or launch thread.
