# Vouch — Product Requirements Document

| | |
|---|---|
| **Status** | Live (v0.1, production) |
| **Owner** | Uddeshya ([@0-uddeshya-0](https://github.com/0-uddeshya-0)) |
| **Last updated** | 2026-06-11 |
| **Related docs** | [Architecture](ARCHITECTURE.md) · [Security & Access](SECURITY-ACCESS.md) · [Frontend Spec](FRONTEND-SPEC.md) · [Tickets](TICKETS.md) · [Deployment](DEPLOYMENT.md) · [Operations](OPERATIONS.md) |

## 1. Problem statement

AI coding assistants author a large share of modern pull requests. Their
characteristic failure is code that *looks correct and isn't*: imports of
packages that don't exist on any registry (19.7% of LLM package
recommendations, per USENIX Security 2025 — now actively exploited as
"slopsquatting"), hardcoded credentials, dependency versions with known CVEs,
and redundant or unused dependencies. Review burden has inverted: 38% of
developers report AI code takes *more* effort to review than human code.

Existing tools either focus on general code review with another LLM
(CodeRabbit, Greptile, Qodo — opinions reviewing opinions) or on supply-chain
security at the organization tier (Snyk, Socket — paid, heavyweight). No tool
owns the narrow, verifiable gate: **"prove this AI-influenced PR doesn't
contain fabricated or dangerous dependencies before a human spends time on
it."**

## 2. Product vision

**The PR gate for the AI-slop era.** Vouch shifts the burden of proof from
maintainer to contributor: a PR must demonstrate it holds up — packages real,
tests present, issue linked, no secrets or CVEs — before a human reviews it.
Checks are deterministic, run in seconds, cost nothing, and never block on a
model's opinion. Every finding carries proof verifiable in one click (a
registry 404, a CVE ID, a matched credential pattern, an AST fact).

## 3. Goals and non-goals

**Goals**

1. Catch hallucinated/slopsquatted npm and PyPI packages with zero false
   positives from infrastructure failures.
2. Catch committed credentials and CVE-affected dependency versions at PR time.
3. Flag dependency slop (unused, redundant, natively-replaceable packages) as
   advisory, never blocking.
4. Two-click adoption for repo owners (public GitHub App); $0 self-hosting for
   teams that require it.
5. Findings triage (view, filter, dismiss) with an auditable trail.

**Non-goals (v0.x)**

- General code review (style, naming, design feedback)
- Languages beyond JS/TS and Python
- GitLab/Bitbucket support
- Organization-wide policy engines, SSO, billing
- Replacing human review — Vouch gates evidence, humans gate judgment

## 4. Personas

| Persona | Need | Primary surface |
|---------|------|-----------------|
| **Maintainer Mia** (OSS maintainer) | Stop AI-slop PRs from contributors without reviewing every manifest line | PR comment + check run |
| **Lead Lukas** (team lead, 5–20 devs) | A safety net for a team using Copilot/Cursor heavily; no budget process | Install link, dashboard triage |
| **Selfhost Sam** (platform/security engineer) | Same checks, but nothing leaves the network | Docker/all-in-one deploy, deterministic/Ollama modes |

## 5. User stories & acceptance criteria

**US-1 — Hallucination gate.** As a maintainer, when a PR adds an import or
dependency that does not exist on npm/PyPI, I see a check run in state
`action_required` and a comment naming the package within 60 seconds of the PR
event.
*AC: registry 404 → finding; registry outage/5xx → no finding; `workspace:`/
`file:`/git ranges and path aliases never checked; verified by tests.*

**US-2 — Secret gate.** As a maintainer, when a PR adds a line matching a
known credential format, I see a `critical`/`high` finding with the line
number. *AC: 12 formats covered; placeholders (`example`, `xxxx`, `your_…`)
filtered; removed lines ignored.*

**US-3 — CVE awareness.** As a reviewer, when a PR pins a version with known
advisories, I see one aggregated finding per package with advisory IDs.
*AC: OSV batch query; one finding per package regardless of advisory count;
highest severity wins.*

**US-4 — Quiet by default.** As a developer, I never see comment spam. *AC:
zero findings → zero comments; one bot comment per PR, updated in place on
every push (hidden marker); quality findings never set `action_required`.*

**US-5 — Triage.** As a team member on the allowlist, I can sign in with
GitHub, filter findings by status/severity/repo/PR, and dismiss false
positives. *AC: dismissal records who and when; non-allowlisted accounts are
rejected with a readable error.*

**US-6 — Frictionless trial.** As an evaluator, I can see the full pipeline
locally in under two minutes without creating a GitHub App (`pnpm demo`), and
install the hosted app in two clicks.

**US-7 — Burden of proof.** As a maintainer, external PRs that lack tests, a
linked issue, or contain unverifiable packages are gated (`action_required`)
with a contributor-facing checklist of what to fix — so I review once, when
it's worth my time. *AC: gate strict for non-OWNER/MEMBER/COLLABORATOR authors
by default; advisory for the team; `vouch.json` can widen (`"all"`), narrow
(`"off"`), or disable individual checks; dependency-hygiene items never block
on their own.*

## 6. Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Verify HMAC-SHA256 signature on every webhook; reject otherwise | P0 |
| FR-2 | Deduplicate deliveries; release dedupe key on processing failure | P0 |
| FR-3 | Analyze `opened`/`synchronize`/`reopened` PR events asynchronously | P0 |
| FR-4 | Registry-verify all added imports/deps (npm, PyPI) with tri-state results | P0 |
| FR-5 | Scan added lines for credential patterns + entropy | P0 |
| FR-6 | Batch-query OSV for added dependency versions; aggregate per package | P0 |
| FR-7 | Detect unused/redundant/natively-replaceable dependencies | P1 |
| FR-8 | Post check run (`action_required`/`neutral`/`success`) + upserted comment | P0 |
| FR-9 | Per-repo config via `vouch.json` (ignore scopes/deps, slop threshold) | P1 |
| FR-10 | Optional LLM tier (`deterministic`/`zero-cost`/`full`); failures never block | P1 |
| FR-11 | Dashboard: GitHub OAuth (allowlisted), filters, dismissal with audit fields | P1 |
| FR-12 | EU AI Act Art. 50 transparency footer on all AI-system output | P0 |
| FR-13 | Maintainer Gate: per-PR evidence verdict (packages real, no secrets/CVEs, tests present, issue linked); strict for external contributors by default, configurable via `gate`/`requireTests`/`requireLinkedIssue` | P0 |

## 7. Non-functional requirements

| Dimension | Requirement |
|-----------|-------------|
| Latency | Webhook ack < 1s; analysis completion p50 < 30s (deterministic mode) |
| Cost | Default stack runs on $0/month free tiers; deterministic mode makes zero paid API calls |
| Reliability | Registry/OSV/LLM outages degrade, never fail the check run erroneously |
| Security | See [SECURITY-ACCESS.md](SECURITY-ACCESS.md); auth fails closed, infra fails open |
| Privacy | No repo cloning; only PR diffs read; only package *names* sent to third parties |
| Testability | Core analysis pure + unit-tested (90 tests); container boot verified before deploy |

## 8. Success metrics

| Metric | Target (6 weeks post-launch) |
|--------|------------------------------|
| Installations (repos) | 50 |
| Analyses completed | 500 |
| Hallucinated packages caught (true positives) | ≥ 5 confirmed by users |
| False-positive dismissal rate | < 10% of findings |
| Median analysis latency | < 15s |
| GitHub stars | 200 |

## 9. Release status & sequencing

- **v0.1 (shipped)** — everything in §6 marked P0/P1; live at
  [github.com/apps/vouch-review](https://github.com/apps/vouch-review).
- **v0.2 (next)** — SARIF export to GitHub code scanning, GitHub Action
  wrapper, org-level policy file. See [TICKETS.md](TICKETS.md).
- **v0.3 (later)** — Slack/Teams notifications, GitLab support, MCP server so
  AI agents can self-verify before opening PRs.

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Registry/OSV rate limits at scale | Redis-backed caching incl. negative caching; backoff with Retry-After |
| False positives erode trust | Tri-state registry, protocol-range exemptions, per-repo ignores, one-click dismissal |
| Free-tier cold starts miss webhook windows | Documented; redelivery path; paid instance recommended at adoption |
| GitHub App suspension (spam perception) | App only ever acts on repos that installed it; no unsolicited activity |
| Solo-maintainer bus factor | Ops runbook + architecture docs written for handoff |
