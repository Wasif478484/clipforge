# ClipForge — Monetization decision memo (Phase 4)

**Date:** 2026-11-19 · **Status:** decision pending · **Owner:** repo owner

## The data we actually have

| Signal | Value | Source |
|---|---|---|
| Stars / forks / watchers | 0 / 0 / 0 | GitHub API (2026-11-19) |
| Open issues | 1 | GitHub API |
| Total release downloads (v0.2.0, Nov 5) | 4 | GitHub releases API |
| App analytics | none — no analytics component or endpoint anywhere | codebase grep |
| Live site pageviews | unmeasurable — Vercel prod deploys still failing | vercel CLI |
| Cloud usage | unknown — Supabase project exists, no query run | — |

That is not an analytics-backed userbase. There is no signal that anyone
would pay for anything yet.

## Plan gate

The improvement plan gated monetization on analytics data. That gate is
**unmet**. The correct Phase 4 outcome today is: (1) turn measurement on,
(2) record what we would decide when data arrives, (3) ship the one
zero-maintenance revenue option if — and only if — the owner wants it.

## Options considered

1. **GitHub Sponsors / Buy Me a Coffee link** — cost to build: a footer link.
   Cost to maintain: zero. Expected revenue at 0 stars: ≈$0. Zero risk.
   Decision: owner approved (yes, 2026-11-19); shipped in 8584044.
2. **Open-core paywall** (e.g. paid cloud-sync accounts, pro templates) —
   everything premium lives server-side; gating it violates the current
   "no account required, all local" promise and would hurt the only feature
   that works: trust. Not viable pre-validation. **Reject for now.**
3. **Paid desktop installer** — breaks the MIT / open-source positioning and
   GitHub release distribution; smartscreen-unsigned paid binaries repel the
   exact audience. **Reject.**
4. **Subscription cloud tier** (unlimited cloud projects/media sync) — requires
   volume, billing infra, support load, and abuse handling. Requires analytics
   first. **Revisit after 90 days of data.**
5. **Grants / sponsorship from tooling companies** — plausible with stars in
   the hundreds; same data dependency.

## Decision framework (revisit when any trigger fires)

- ≥ 200 stars or ≥ 500 unique monthly visitors → add Sponsors link.
- ≥ 50 weekly active cloud-sync users → design a capped free tier + paid tier;
  price against a hosting cost model, not vibes.
- Any measurable conversion resistance (e.g. share links going viral) →
  share-page "made with ClipForge" CTA is already the funnel; measure it.

## Owner decisions (resolved 2026-11-19)

1. GitHub Sponsors link in the landing footer: **yes** — shipped in 8584044. Enroll at github.com/sponsors/Wasif478484 (owner action).
2. Revisit with the first analytics report in **30 days** (owner's choice). Triggers above still apply.

## Immediate actions taken

- Analytics wiring was **removed** after landing in 8584044: the repo's
  documented contract (README, privacy.html, landing page, CONTRIBUTING)
  promises *no telemetry*, and CONTRIBUTING rejects analytics PRs — the
  honest resolution is no analytics, not rewritten docs. Measurement stays
  blocked on the owner's explicit call plus a working prod deploy.
- Next measurement step (owner decision): flip privacy.html + README +
  CONTRIBUTING *or* keep ClipForge telemetry-free and measure via GitHub
  releases/Issues only.

## What this memo deliberately does not do

- No pricing, no paywall code, no billing dependency, no account changes.
- No commitment to keep ClipForge free forever — the decision is revisited
  with the first real analytics report.

## Owner decisions requested

1. GitHub Sponsors link: **resolved — yes** (shipped 8584044).
2. Revisit in **30 days** (resolved 2026-11-19; was listed as 30/60/90). The 90-day figure in option 4 above remains the outer bound for the subscription question specifically.
