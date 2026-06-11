# Vouch — Security & Access Document

| | |
|---|---|
| **Scope** | Webhook API, analysis worker, dashboard, data stores, third-party integrations |
| **Last reviewed** | 2026-06-11 (against the live production deployment) |
| **Companion docs** | [SECURITY.md](../SECURITY.md) (disclosure policy) · [ARCHITECTURE.md](ARCHITECTURE.md) · [OPERATIONS.md](OPERATIONS.md) |

## 1. Data classification

| Class | Examples | Where it lives | Notes |
|-------|----------|----------------|-------|
| **Secrets** | GitHub App private key, webhook secret, OAuth client secret, `NEXTAUTH_SECRET`, DB/Redis URLs | Host env vars (Render/Vercel); local `scripts/github-app/*` (gitignored, `0600`) | Never committed, never logged, never in chat/PRs |
| **Customer code excerpts** | Finding `codeSnippet` (≤200 chars of diff), file paths, package names | PostgreSQL (Neon) | The most sensitive stored data — drives dashboard auth requirements |
| **Metadata** | Installation/repo names, PR numbers, severities, audit events | PostgreSQL, stdout logs | Private repo *names* are sensitive |
| **Transient** | Raw webhook payloads, PR patches | Process memory + Redis queue only | Not persisted beyond job lifetime |

## 2. Authentication & authorization matrix

| Surface | AuthN | AuthZ | Failure mode |
|---------|-------|-------|--------------|
| `POST /webhooks/github` | HMAC-SHA256 (`X-Hub-Signature-256`), constant-time compare | Implicit: only GitHub holds the secret | 401; no handler executes |
| `GET /health*` | none (by design) | public liveness only — no tenant data | n/a |
| `/api/v1/*` (admin) | Bearer `ADMIN_API_TOKEN`, constant-time compare | token holder = admin | **503 when token unset** (deny-by-default), 401 on mismatch |
| Dashboard pages | GitHub OAuth (NextAuth JWT session) | `DASHBOARD_ALLOWED_LOGINS` allowlist; **empty list in production = deny all** | redirect to sign-in; readable error banner |
| Dashboard server actions (dismiss) | session required (or dev-only demo mode) | same allowlist via session | throws Unauthorized |
| GitHub API (outbound) | App JWT (RS256, 9-min expiry) → installation tokens | GitHub-scoped per installation | API errors fail the single analysis only |
| Demo mode | n/a | `DASHBOARD_DEMO_MODE=true` **and** `NODE_ENV !== 'production'` | structurally impossible on deployed builds |

**Privilege boundaries:** the GitHub App requests the minimum permission set —
Pull requests (RW), Issues (RW — comments use the issues API), Checks (RW),
Contents (R — diffs and `vouch.json`), Metadata (R). No code-write, no admin,
no member, no email permissions. Dashboard sessions never hold GitHub tokens
beyond the OAuth exchange; sessions carry only `login`.

## 3. Threat model (STRIDE summary)

| Threat | Vector | Control |
|--------|--------|---------|
| **Spoofing** | Forged webhooks | HMAC + `timingSafeEqual`; secret is 32+ random chars |
| | OAuth callback hijack | Exact-match registered callback URL on the GitHub App |
| **Tampering** | Malicious PR content reaching analyzers | Patches treated as data: AST parsers fail closed on syntax errors; no `eval`; no shell interpolation of PR content; repos never cloned/executed |
| **Repudiation** | Untracked triage actions | Dismissals persist `dismissedBy` + `dismissedAt`; structured audit events for every webhook/analysis |
| **Information disclosure** | Unauthenticated installation/finding access | Admin API deny-by-default; dashboard allowlist deny-by-default in prod; private-repo snippets only behind auth |
| | Secrets in logs | Loggers emit metadata only; secrets never interpolated |
| **DoS** | Webhook floods | Per-IP rate limits (Redis), idempotency dedupe, queue isolation (API stays responsive while workers absorb backlog) |
| | Registry hammering | Redis cache incl. negative caching of 404s; exponential backoff honoring `Retry-After` |
| **Elevation** | Plan tampering via admin API | Token-gated + constant-time compare; disabled entirely when unconfigured |

**Prompt-injection note (LLM modes):** PR diffs are untrusted input to the LLM
tier. Mitigations: findings are accepted only through a constrained
tool/JSON schema (free text from the model is discarded), findings are
advisory-typed and capped in severity influence, and the LLM tier cannot alter
deterministic findings or check-run conclusions derived from them. Deterministic
mode (default) eliminates the surface entirely.

## 4. Third-party data flows

| Destination | What is sent | When |
|-------------|--------------|------|
| registry.npmjs.org / pypi.org | package **names** only | every analysis |
| api.osv.dev | package names + versions | every analysis |
| api.github.com | check runs, comments, diff/file reads | every analysis |
| api.anthropic.com | PR diff text | **only** `VOUCH_MODE=full` |
| local Ollama | PR diff text (stays on your network) | only `zero-cost` |

No analytics, no telemetry, no tracking on any surface.

## 5. Transport & platform security

- TLS termination on all public surfaces (Render/Vercel managed certs); Neon
  enforces `sslmode=require`; Upstash-style Redis uses `rediss://` (Render Key
  Value is private-network only, `ipAllowList: []`).
- Containers run as non-root (`nodejs` uid 1001) under `dumb-init`.
- Dashboard ships hardened HTTP headers (HSTS, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  restrictive `Permissions-Policy`) via `next.config.js`.
- Dependencies are locked (`pnpm-lock.yaml`, `--frozen-lockfile` in CI/Docker).

## 6. Compliance posture

| Regime | Position |
|--------|----------|
| **EU AI Act (Art. 50 transparency)** | Every AI-system output self-identifies: PR comments and check runs carry an AI disclosure footer naming the analysis method/model. Deterministic findings are separated and reproducible. Human oversight: nothing merges or blocks without a human able to override; dismissals are attributed. See [compliance/eu-ai-act.md](compliance/eu-ai-act.md) for honest gaps (no calibration reporting yet). |
| **GDPR** | Data minimization by design: no repo cloning, no emails collected (the OAuth flow deliberately skips `/user/emails`), only GitHub logins + code excerpts processed. Self-host = full data residency control. Uninstalling the app deletes repo/analysis/finding rows on the `installation_repositories removed` path; account-level erasure requests handled via issue/email. **Gap (tracked):** no automated full-account purge endpoint yet — see [TICKETS.md](TICKETS.md) VOUCH-21. |
| **OWASP ASVS (level 1)** | Spot-checked: V2 (authn — OAuth + allowlist), V3 (sessions — NextAuth JWT, secure cookies), V4 (access control — deny-by-default on both admin and dashboard), V5 (input — Zod-validated env, schema-validated LLM output, no dynamic execution), V9 (communications — TLS everywhere), V14 (config — fail-fast env validation). |
| **Supply chain (self)** | Locked installs; CI builds from lockfile; Vouch analyzes its own PRs (dogfood installation active). |

## 7. Known accepted risks

| Risk | Acceptance rationale |
|------|----------------------|
| Render free tier cold starts can exceed GitHub's 10s webhook window | Hobby-tier tradeoff; redelivery documented; upgrade path one click |
| Findings retention unbounded | Volume tiny at current scale; pruning ticketed (VOUCH-22) |
| No SSO/2FA on dashboard beyond GitHub's own | Allowlist + GitHub account security considered sufficient pre-revenue |
| Secrets scanner is pattern-based (no verification calls) | Verifying candidate secrets against providers would exfiltrate them; patterns + entropy chosen deliberately |

## 8. Security checklist for deployers

- [ ] `GITHUB_WEBHOOK_SECRET` ≥ 32 random chars
- [ ] `DASHBOARD_ALLOWED_LOGINS` set before first production sign-in
- [ ] `ADMIN_API_TOKEN` unset unless the admin API is needed
- [ ] Database and Redis not publicly reachable (or TLS + auth enforced)
- [ ] GitHub App private key stored only in host secret manager
- [ ] `VOUCH_MODE=full` only after reviewing Anthropic data handling
- [ ] Dependabot/renovate or periodic `pnpm audit` on your fork
