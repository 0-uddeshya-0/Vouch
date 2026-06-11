# Deploying Vouch

Two paths. Both put a real Vouch instance on live pull requests.

- **Free forever** — Render (backend, all-in-one) + Neon (Postgres) + Upstash (Redis) + Vercel (dashboard). No credit card needed for the databases; `deterministic` mode means no LLM cost. **Start here.**
- **Railway** — paid after the trial credit, but a slightly simpler single-provider backend. Covered at the bottom.

Throughout, replace `your-api.onrender.com` and `your-dashboard.vercel.app` with your real URLs.

---

## The free path

### 1. Databases (2 minutes, no card)

**Postgres → [Neon](https://neon.tech):** create a project, copy the connection string (it includes `?sslmode=require`). That's your `DATABASE_URL`.

**Redis → [Upstash](https://upstash.com):** create a database, copy the **TLS** URL (starts with `rediss://`). That's your `REDIS_URL`. BullMQ works with Upstash over TLS with no extra config.

Push the schema from your laptop:

```bash
cp .env.example .env          # paste your Neon DATABASE_URL into it
pnpm install
DATABASE_URL="<neon-url>" npx prisma migrate deploy
```

### 2. Create the GitHub App (one approval, no manual clicking)

The manifest flow creates the app with the correct permissions and events, and writes the credentials to a ready-to-paste `.env` block:

```bash
node scripts/github-app/create-github-app.mjs https://your-api.onrender.com/webhooks/github
```

It opens a browser, you approve once, and it saves:

- `scripts/github-app/vouch-app-private-key.pem`
- `scripts/github-app/.env.github-app` — contains `GITHUB_APP_ID`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_PRIVATE_KEY`, plus `GITHUB_ID` / `GITHUB_SECRET` for dashboard login.

It also prints your **public install link** (`https://github.com/apps/<slug>`) — that's what you share with teammates.

> Don't have the Render URL yet? Use a placeholder, deploy step 3 to learn the URL, then edit the GitHub App's webhook URL afterward. Or pass the real URL once Render assigns it and re-run.

> "Name already taken"? GitHub App names are global. Re-run with `APP_NAME="Vouch <yourhandle>" node scripts/github-app/create-github-app.mjs <url>`.

### 3. Backend → Render (free, all-in-one)

[`render.yaml`](../render.yaml) deploys the webhook server **and** the analysis worker in one free web service.

1. Push this repo to your GitHub account.
2. On [Render](https://render.com): **New ＋ → Blueprint → pick the repo**. Render reads `render.yaml`.
3. When prompted, paste the `sync: false` values:
   - `DATABASE_URL` (Neon), `REDIS_URL` (Upstash)
   - `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` (from step 2)
   - `VOUCH_DASHBOARD_URL` (your Vercel URL — set after step 4, then redeploy)
4. Deploy. The blueprint runs `prisma migrate deploy` then `node apps/api/dist/all-in-one.js`.

Verify:

```bash
curl https://your-api.onrender.com/health     # {"status":"healthy",...}
```

> Render's free web service sleeps after inactivity. GitHub retries webhook deliveries, so a cold start just delays the first analysis by a few seconds — fine for personal/hobby use. Upgrade the instance to keep it warm.

### 4. Dashboard → Vercel (free)

1. [Vercel](https://vercel.com) → **Add New Project** → import the repo.
2. **Root directory:** `apps/dashboard` (Next.js auto-detected; [`vercel.json`](../apps/dashboard/vercel.json) supplies the build).
3. Environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | same Neon URL |
| `NEXTAUTH_URL` | `https://your-dashboard.vercel.app` (set after first deploy, then redeploy) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GITHUB_ID` / `GITHUB_SECRET` | from `.env.github-app` |
| `DASHBOARD_ALLOWED_LOGINS` | your GitHub login (comma-separated) — **required**, or all sign-ins are rejected |

4. Deploy, copy the URL, set `VOUCH_DASHBOARD_URL` on Render, redeploy the backend.

> The GitHub App from step 2 doubles as the OAuth provider for dashboard login — no separate OAuth app needed. Just confirm its **callback URL** includes `https://your-dashboard.vercel.app/api/auth/callback/github` (GitHub App → General → Callback URL).

### 5. Install and dogfood

Install on your repos via the link from step 2, then create a deliberately-bad PR:

```bash
./scripts/dogfood/create-dogfood-pr.sh
git push -u origin dogfood/vouch-production-test
# open the PR against main
```

Within seconds you should see, on the PR:

| Output | Why |
|--------|-----|
| Check run **Action required** | a hallucinated package was found |
| `npm package not found: express-auth-slop` | it doesn't exist on npm |
| `Unused dependency: lodash` | added to package.json, never imported |
| A single PR comment | tables, `> [!WARNING]`, AI disclosure footer, dashboard links |
| Dashboard rows | at `/findings?pr=<number>` |

---

## Railway (paid alternative)

Railway is simpler if you want one provider for compute, but it bills after the trial credit.

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub** → select the repo. It detects the root `Dockerfile` and [`railway.toml`](../railway.toml), which runs the **all-in-one** process.
2. **+ New → Database** → add Postgres and Redis.
3. Set variables on the service:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   REDIS_URL    = ${{Redis.REDIS_URL}}
   GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET
   VOUCH_MODE=deterministic
   VOUCH_DASHBOARD_URL=https://your-dashboard.vercel.app
   NODE_ENV=production
   ```
4. **Settings → Networking → Generate Domain**, then use that domain as your GitHub App webhook URL. Dashboard still goes on Vercel (step 4 above).

---

## Choosing an analysis mode

`deterministic` (the default) needs nothing and costs nothing — registry, secret, CVE, and slop checks only. Upgrade later by setting `VOUCH_MODE`:

- `zero-cost` — point `OLLAMA_BASE_URL` at an Ollama instance for local logic-flaw analysis.
- `full` — set `ANTHROPIC_API_KEY` for Haiku→Sonnet escalation (a few cents per PR).

LLM failures never block a PR; analysis falls back to deterministic findings.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Webhook 401 | `GITHUB_WEBHOOK_SECRET` must match the GitHub App setting exactly |
| No analysis | check the backend logs for `Analysis worker started`; confirm `REDIS_URL` is the `rediss://` TLS URL |
| No PR comment | zero findings posts no comment, by design — check logs for errors |
| Every sign-in rejected | set `DASHBOARD_ALLOWED_LOGINS` in production |
| Dashboard login loops | `NEXTAUTH_URL` must equal the Vercel URL; callback URL must be registered on the GitHub App |
| First webhook is slow | Render free instances cold-start; GitHub retries, so it still lands |
