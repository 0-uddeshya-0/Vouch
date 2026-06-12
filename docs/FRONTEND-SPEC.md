# Vouch Dashboard — Frontend Specification

| | |
|---|---|
| **Stack** | Next.js 14 (App Router) · React 18 · Tailwind CSS 3 · NextAuth 4 |
| **Source** | `apps/dashboard/src` |
| **Live** | https://vouch-dashboard.vercel.app |
| **Companion docs** | [PRD](PRD.md) · [Architecture](ARCHITECTURE.md) · [Security & Access](SECURITY-ACCESS.md) |

## 1. Design language

Dark, terminal-adjacent, evidence-first. The UI should feel like a security
tool, not a marketing site: high contrast, monospace for anything that is
code/identifier, color used only to encode meaning.

### Tokens

| Token | Value | Use |
|-------|-------|-----|
| Background | `slate-950` (#020617) | page |
| Surface | `slate-900/40` + `border-slate-800` | cards, tables, banners |
| Text primary | `slate-100` | headings, values |
| Text secondary | `slate-400` / `slate-500` | body, labels |
| Brand accent | `emerald-500` → gradient to `cyan-400` | CTAs, brand mark, positive |
| Critical / High | `red-950` bg · `red-300` text | severity badges, alerts |
| Medium | `amber-950` bg · `amber-300` text | severity badges |
| Low | `slate-800` bg · `slate-300` text | severity badges |
| Warning surface | `amber-950/30` + `border-amber-900/60` | demo-mode banner |
| Error surface | `red-950/40` + `border-red-900/60` | auth-error banner |

Typography: system UI stack (`antialiased`); monospace (`font-mono`) for repo
names, file paths, package names, code snippets, logins. Type scale: page
title `text-2xl font-semibold tracking-tight`; section labels
`text-xs uppercase tracking-wide text-slate-500`; body `text-sm`.

Iconography: inline SVG only (GitHub mark, brand shield). No icon library
dependency. Brand assets: `docs/assets/icon.svg` (master),
`src/app/icon.svg` + `favicon.ico` + `apple-icon.png` (served by App Router
convention).

Motion: single `animate-fade-up` keyframe (0.5s ease-out, 8px rise), staggered
80ms on card grids, disabled under `prefers-reduced-motion`. No other
animation.

## 2. Routes & layout

| Route | Type | Auth | Purpose |
|-------|------|------|---------|
| `/` | server component | public | landing: hero, pipeline explainer, example diff, sign-in CTA, auth-error display |
| `/findings` | server component (`force-dynamic`) | session **or** demo mode | triage table with stats and filters |
| `/api/auth/*` | NextAuth route handler | n/a | OAuth + session endpoints |
| not-found | server component | public | branded 404 with home link |

Shared layout: sticky top nav (brand wordmark → `/`, "Findings" → `/findings`),
`max-w-7xl` content column, `px-4 sm:px-6 lg:px-8` gutters.

## 3. Page specs

### 3.1 Landing (`/`)

Positioning: "the PR gate for the AI-slop era" — crisis-led, maintainer-first.
Left-aligned editorial hero (no gradient text, no numbered card scaffolding).

Sections in order:
1. **Auth error banner** (conditional) — maps NextAuth `?error=` codes to
   human messages (`AccessDenied` → allowlist explanation; unknown codes fall
   back to a generic retry line).
2. **Hero (2-col on lg)** — H1 "Your reviewers are drowning in AI slop."
   (solid white, emerald only on the key phrase); two short crisis/solution
   paragraphs with real stats (32.7% vs 84.4%, 1.7×); CTA row
   (`SignInButton` or "View findings →" + install link); trust line
   ("Deterministic checks only…").
3. **Hero artifact** — a `figure` mocking the real bot comment: header bar
   (`vouch-review[bot] commented`, "review gated" pill), the Maintainer Gate
   checklist (✅/❌ items with detail lines), closing caption. The product is
   the picture.
4. **Evidence section** — prose heading + `dl` definition list
   (registry 404 / OSV advisory ID / AST, not regex vibes). No cards.
5. **Enforcement section (2-col)** — prose explaining audience-aware
   strictness + a real copyable `vouch.json` code block.
6. **Closing CTA strip** — bordered top, headline + install/source buttons.

States: signed-out (default) · signed-in · demo (amber notice) ·
auth-error (red banner).

### 3.2 Findings (`/findings`)

1. **Demo banner** (demo mode only).
2. **Header** — title, signed-in identity, contextual subtitle (PR filter echo).
3. **Stat cards** (4-up, 2-up on mobile): Open findings · Critical/High (red) ·
   Hallucinated packages (amber) · Repositories (emerald). Counts come from
   grouped queries on *open* findings, independent of active filters.
4. **Filter bar** — three `<select>`s (status: open/dismissed; severity;
   repository) implemented as a client component that writes
   `searchParams` (URL is the single source of filter state — shareable links).
5. **Findings table** — columns: Repository (mono) · PR `#n` · File:line
   (mono, truncated `max-w-[12rem]`) · Severity badge · Type · Finding
   (title + 2-line clamped description + optional snippet `<pre>`) · Action.
   Row cap 200, newest first. Dismissed rows render muted.
6. **Dismiss action** — button per open row; optimistic update via
   `useTransition`, rollback + error banner on failure; "Dismissed" label
   replaces the button afterward.
7. **Empty state** — bordered panel: "No findings yet. Run a PR analysis to
   populate this view."

Deep links: `/findings?pr=3&finding=<uuid>` (used by PR-comment "View
Details") filters to the PR and highlights via the `finding` param filter.

## 4. Data access pattern

Server components query Prisma directly (no intermediate API). Mutations go
through server actions (`'use server'`) which re-validate the session +
allowlist on every call — client state is never trusted. `revalidatePath`
refreshes after dismissal.

## 5. Accessibility

- Semantic landmarks; tables are real `<table>` elements.
- All interactive elements are native `<button>`/`<a>`/`<select>` —
  keyboard-operable by default; visible focus outlines (browser default kept).
- Color never the sole carrier: severity badges include the text label.
- `role="alert"` on error banners; SVGs carry `aria-label` or `aria-hidden`.
- Reduced-motion respected (§1 Motion).
- Contrast: all text ≥ 4.5:1 against `slate-950` (slate-400 = 7.6:1).

## 6. Performance budget

- First Load JS ≤ 110 kB per route (current: ~102 kB `/`, ~93 kB `/findings`).
- No client-side data fetching libraries; zero third-party scripts.
- Images: brand SVGs inline; screenshots only in docs, never shipped to the app.

## 7. Error & edge handling

| Case | Behavior |
|------|----------|
| Auth failure | redirect to `/` with `?error=`, mapped banner (§3.1.4) |
| Non-allowlisted login | `AccessDenied` banner with the env var named |
| DB unreachable | route-level `error.tsx` boundary with retry |
| Slow query | `loading.tsx` skeleton (pulse blocks) |
| Unknown route | branded `not-found.tsx` |
| Dismiss conflict (already dismissed) | server action no-ops, returns ok |

## 8. Conventions for contributors

- Server components by default; `'use client'` only for interactivity
  (current client islands: `SignInButton`, `FindingsFilter`, `FindingsList`).
- Tailwind utility classes inline; no CSS modules; shared keyframes in
  `globals.css` under `@layer utilities`.
- New env consumption goes through `@vouch/config` — never raw `process.env`
  in components.
- Every new page needs: loading state, error boundary behavior, empty state,
  and a row in this spec.
