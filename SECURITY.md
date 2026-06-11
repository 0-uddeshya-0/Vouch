# Security Policy

## Supported Versions

Vouch is pre-1.0. Only the latest commit on `main` receives security fixes.

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

Report privately via [GitHub private vulnerability reporting](https://github.com/0-uddeshya-0/Vouch/security/advisories/new) on this repository. You can expect an acknowledgment within a few days.

Include where possible:

1. A description of the vulnerability and its impact
2. Step-by-step reproduction instructions
3. The commit or version you tested against

We follow coordinated disclosure: we'll work with you on a fix and credit you in the advisory if you'd like.

## Security Properties of the Current Implementation

- **Webhook authenticity** — every `/webhooks/github` request is verified with HMAC-SHA256 (`X-Hub-Signature-256`) using a constant-time comparison.
- **Replay protection** — delivery IDs are deduplicated in Redis for one hour.
- **Admin API locked by default** — the `/api/v1` endpoints return 503 unless `ADMIN_API_TOKEN` is configured, and then require a Bearer token (constant-time compared).
- **Dashboard access control** — GitHub OAuth sign-in is restricted to the logins in `DASHBOARD_ALLOWED_LOGINS`; in production, sign-ins are rejected when the allowlist is unset.
- **No repo checkout** — Vouch analyzes PR diffs fetched through the GitHub API; it never clones repositories to disk.
- **Fail-safe registry checks** — a package is only reported as hallucinated when the registry definitively returns 404. Outages and rate limits never produce findings.
- **Rate limiting** — per-IP limits on API routes, backed by Redis.

## Data Flow Considerations

- **LLM modes**: in `full` mode, PR diffs are sent to the Anthropic API. In `zero-cost` mode, inference runs on your own Ollama instance and diffs never leave your infrastructure.
- **Registries**: package *names* (never code) are sent to registry.npmjs.org, pypi.org, and api.osv.dev.
- **Persistence**: findings (including short code snippets from diffs) are stored in PostgreSQL for the dashboard. Treat database access accordingly.

## Deployment Checklist

- [ ] Strong random `GITHUB_WEBHOOK_SECRET` (32+ chars)
- [ ] `DASHBOARD_ALLOWED_LOGINS` set before exposing the dashboard
- [ ] `ADMIN_API_TOKEN` set only if you need the admin API
- [ ] HTTPS termination in front of the API (Railway/Vercel provide this)
- [ ] Database and Redis not exposed to the public internet
- [ ] Dependencies kept up to date
