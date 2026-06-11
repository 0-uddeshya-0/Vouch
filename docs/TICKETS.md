# Vouch — Feature Ticket Backlog

Conventions: `P0` = blocks adoption/safety · `P1` = next release (v0.2) ·
`P2` = later (v0.3+). Sizes: S (<½ day) · M (1–2 days) · L (3+ days).
Status reflects 2026-06-11. Done tickets are kept for traceability with the
[PRD](PRD.md).

## Shipped (v0.1) — traceability

| ID | Title | PRD ref |
|----|-------|---------|
| VOUCH-1 | Webhook ingestion: HMAC verify, dedupe, async queue | FR-1..3 |
| VOUCH-2 | Registry verification w/ tri-state results + negative caching | FR-4 |
| VOUCH-3 | Secrets scanner (12 formats) + entropy pass | FR-5 |
| VOUCH-4 | OSV batch scan, aggregated per package | FR-6 |
| VOUCH-5 | Slop detector (unused/redundant/native-alternative) | FR-7 |
| VOUCH-6 | Check run + single upserted PR comment w/ AI disclosure | FR-8, FR-12 |
| VOUCH-7 | `vouch.json` per-repo config | FR-9 |
| VOUCH-8 | LLM router: deterministic/zero-cost/full, fail-open | FR-10 |
| VOUCH-9 | Dashboard: OAuth allowlist, filters, dismissal audit | FR-11 |
| VOUCH-10 | `pnpm demo` + dev-only demo mode | US-6 |
| VOUCH-11 | Free-tier deploy: all-in-one mode, render.yaml, app-manifest script | §3 Goal 4 |
| VOUCH-12 | Brand assets: banner, icon, favicon set | — |

## P0 — safety & correctness

| ID | Title | Size | Acceptance criteria |
|----|-------|------|---------------------|
| VOUCH-20 | **Webhook delivery monitor** | M | Scheduled check of `GET /app/hook/deliveries` for failed deliveries in last 24h; surfaced via log/issue. No silent webhook loss. |
| VOUCH-21 | **GDPR account purge path** | M | `installation deleted` event triggers full cascade delete (installation → repos → analyses → findings → usage). Documented erasure SLA in SECURITY-ACCESS §6. |
| VOUCH-22 | **Findings retention pruning** | S | Configurable `RETENTION_DAYS` (default 90); daily job deletes older analyses/findings; documented in OPERATIONS. |
| VOUCH-23 | **Worker concurrency back-pressure for free tier** | S | Concurrency configurable via env (default 5 → 2 on free); OOM-free on 512 MB instance under 10 concurrent PRs. |

## P1 — v0.2 (adoption & integrations)

| ID | Title | Size | Acceptance criteria |
|----|-------|------|---------------------|
| VOUCH-30 | **SARIF export → GitHub code scanning** | M | Findings uploaded as SARIF per analysis; appear in the repo Security tab; severity mapping documented. |
| VOUCH-31 | **GitHub Action wrapper** | M | `uses: 0-uddeshya-0/vouch-action@v1` runs deterministic pipeline in CI without the App; outputs SARIF + step summary; README quickstart. |
| VOUCH-32 | **Org-level policy file** | M | `.github/vouch.json` in an org `.github` repo sets defaults for all installed repos; per-repo file overrides; precedence tested. |
| VOUCH-33 | **Block-on-severity policy** | S | `vouch.json: {"failOn": "critical"}` controls check-run conclusion mapping; default unchanged (`action_required` on security/hallucination). |
| VOUCH-34 | **Dashboard pagination + search** | M | Cursor pagination past 200 rows; text search over title/package; URL-driven. |
| VOUCH-35 | **Per-finding detail view** | M | `/findings/<id>` route with full snippet, advisory links, dismissal with reason; PR comment links target it. |
| VOUCH-36 | **requirements.txt/pyproject version pinning advisories** | S | PyPI deps without version pins get a low-severity advisory finding (configurable). |
| VOUCH-37 | **Monorepo path scoping** | S | `vouch.json: {"include": ["packages/*"]}` restricts analysis; out-of-scope files skipped. |

## P2 — v0.3+ (expansion)

| ID | Title | Size | Notes |
|----|-------|------|-------|
| VOUCH-40 | Slack / Teams notifications | M | per-installation webhook URL, critical-only default |
| VOUCH-41 | GitLab support | L | webhook + MR notes adapter behind a VCS interface |
| VOUCH-42 | MCP server ("vouch-check") | M | lets AI agents verify packages/diffs *before* opening PRs — agent-native distribution |
| VOUCH-43 | Go / Rust ecosystem support | L | proxy.golang.org + crates.io clients, import extractors |
| VOUCH-44 | Lockfile deep-diff analysis | M | transitive additions via pnpm-lock/package-lock parsing |
| VOUCH-45 | Typosquat *similarity* warnings | M | flag close-name packages that DO exist (levenshtein vs top-1000) — high FP risk, ship behind flag |
| VOUCH-46 | LLM confidence calibration reporting | M | closes the EU-AI-Act "calibration" gap; dismissal data as ground truth |
| VOUCH-47 | Public status page + uptime probe | S | free tier: GitHub Action cron hitting /health + badge |
| VOUCH-48 | Billing scaffold (plans already modeled) | L | only when usage justifies it |

## Engineering debt register

| ID | Item | Risk if unaddressed |
|----|------|---------------------|
| VOUCH-60 | Integration test: webhook→queue→worker against mocked GitHub API | regressions in the glue only surface in prod |
| VOUCH-61 | Worker unit split: `worker.ts` is 500+ lines | change amplification |
| VOUCH-62 | Typed Prisma rows in dashboard (drop manual interfaces in `installations.ts`) | drift between schema and casts |
| VOUCH-63 | Structured logger (pino) in worker instead of `console.*` | log querying in aggregators |
| VOUCH-64 | Rate-limit headers: align `X-RateLimit-Reset` to epoch seconds (spec) | client confusion |
