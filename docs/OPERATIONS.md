# Operations Runbook

Day-2 operations for a deployed Vouch instance. Commands assume the free-tier
stack from [DEPLOYMENT.md](DEPLOYMENT.md) (Render + Neon + Vercel), but the
concepts apply anywhere.

## Quick health

```bash
curl https://<your-api>.onrender.com/health
# {"status":"healthy", "services":{"database":"connected","redis":"connected"}}
```

`/health/ready` returns 503 until both stores are reachable; `/health/live` is
a bare liveness probe.

## Reading logs

Everything is structured JSON on stdout. On Render:

```bash
curl -s -G -H "authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/logs" \
  --data-urlencode "ownerId=<owner-id>" \
  --data-urlencode "resource=<service-id>" \
  --data-urlencode "limit=50"
```

Audit events to grep for: `webhook_received`, `webhook_failed` (includes a
`reason`), `analysis_started`, `analysis_completed` (includes `findingsCount`),
`analysis_failed`, `rate_limit_hit`.

## Deploying

CI (GitHub Actions) runs build + tests on every push to `main`.

**Render does not auto-deploy public-URL repos.** Either connect the repo via
Render's GitHub integration once (Settings → Build & Deploy), or trigger
deploys explicitly:

```bash
curl -X POST -H "authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/<service-id>/deploys" -d '{}'
```

The Vercel dashboard deploys with `npx vercel deploy --prod` from the repo
root (project root directory is set to `apps/dashboard`).

Always verify a backend change boots **locally** before deploying:

```bash
docker build -t vouch-api-test .
docker run --rm -p 3009:3000 \
  -e DATABASE_URL=... -e REDIS_URL=... \
  -e GITHUB_APP_ID=1 -e GITHUB_PRIVATE_KEY=x -e GITHUB_WEBHOOK_SECRET=x \
  -e VOUCH_MODE=deterministic vouch-api-test
curl localhost:3009/health
```

## Failure modes seen in production (and their fixes)

These all actually happened during the first live deployment — kept here so
nobody debugs them twice:

| Symptom | Cause | Resolution |
|---------|-------|------------|
| Container exits 127 on Render | `dockerCommand` override is passed as a single argv token | Don't override; the image CMD already runs migrate + all-in-one |
| `Cannot find module '@vouch/config/env'` at boot | pnpm workspace symlinks live in `apps/api/node_modules`, which wasn't copied into the image | Fixed in Dockerfile; if you fork the image layout, copy that dir |
| Webhook 500: "Missing installation…" | `pull_request` payloads carry only `installation.id`, not `account` | Handler falls back to `repository.owner` (fixed) |
| Redelivered webhook ignored | Failed deliveries used to leave their idempotency key set | Keys are released on failure (fixed); redeliver from the App's Advanced tab |
| Workspace packages flagged as hallucinated | `workspace:*`/`file:`/git ranges were registry-checked | Skipped by `isRegistryInstallableRange` (fixed) |
| First webhook after idle is slow / times out | Render free instances sleep; cold start can exceed GitHub's 10s delivery window | Harmless for hobby use (close/reopen the PR re-triggers). For real users, keep the instance warm or upgrade |
| Sign-in button loops back to the homepage | With a custom `pages.signIn`, `GET /api/auth/signin` redirects — it doesn't start OAuth | The button calls `signIn('github')` client-side (fixed) |

## Webhook redelivery

GitHub does **not** automatically retry failed deliveries. To replay one:
GitHub → Settings → Developer settings → GitHub Apps → Vouch Review →
Advanced → pick the delivery → **Redeliver**. (Idempotency keys are released
on failure, so the replay is processed.)

## Updating GitHub App configuration

- **Webhook URL** can be changed programmatically with an app JWT:
  `PATCH https://api.github.com/app/hook/config {"url": "..."}`.
- **Callback URL** (dashboard OAuth) must be edited in the App settings page.
- **Permissions changes** require installations to approve the new permissions.

## Secrets rotation

| Secret | Rotate where | Then |
|--------|--------------|------|
| GitHub App private key | App settings → generate new key | update `GITHUB_PRIVATE_KEY` on Render, redeploy |
| Webhook secret | App settings + `GITHUB_WEBHOOK_SECRET` on Render | redeploy (update both sides together) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` → Vercel env | redeploy dashboard (invalidates sessions) |
| Render/Vercel/Neon API keys | provider dashboards | nothing in-app uses them at runtime |

## Database

Neon free tier auto-suspends compute after inactivity; first query wakes it
(sub-second). Migrations run automatically on every backend boot via
`prisma migrate deploy` (advisory-locked, safe concurrently). To apply
migrations manually:

```bash
DATABASE_URL=<neon-url> npx prisma migrate deploy --schema=prisma/schema.prisma
```

Findings retention is currently unbounded — prune old `Analysis`/`Finding`
rows with a scheduled job if the 500 MB free tier fills up.

## Cost watch

Everything is sized for permanent free tiers: Render free web service +
Key Value, Neon free Postgres, Vercel Hobby. `VOUCH_MODE=deterministic` makes
zero LLM calls. The only way this stack starts costing money is switching
`VOUCH_MODE=full` (Anthropic API usage) or upgrading Render to stay warm.
