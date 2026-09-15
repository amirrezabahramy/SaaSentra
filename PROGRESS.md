# PROGRESS.md — SaaS Dashboard v1 Build Tracker

> Single source of truth for build status. Update after each phase completes.
> Read `INSTRUCTIONS.md` (contract) and `BLUEPRINT.md` (scope) before starting.
> Source of truth for the data model: `prisma/schema.prisma`.

## How to use this file

- Set one status per phase: `[ ]` not started · `[~]` in progress · `[x]` done.
- Record decisions, deviations, and scaffold conflicts under **Notes** — the
  final report must list every file created/modified/deleted plus assumptions.
- A phase is "done" only when every checkbox in its file is checked and its
  verification command(s) pass. Never mark a phase done with failing checks.
- Do not skip ahead: each phase depends on the previous one completing.

## Status board

| Phase | File | Status | Date |
| --- | --- | --- | --- |
| 00 — Scaffold & deps | `phases/00-scaffold.md` | [ ] | |
| 01 — Data layer | `phases/01-data-layer.md` | [ ] | |
| 02 — Domain logic | `phases/02-domain-logic.md` | [ ] | |
| 03 — Auth | `phases/03-auth.md` | [ ] | |
| 04 — Entitlements API | `phases/04-entitlements.md` | [ ] | |
| 05a — Admin UI core | `phases/05a-admin-ui-core.md` | [ ] | |
| 05b — Admin UI ops | `phases/05b-admin-ui-ops.md` | [ ] | |
| 06 — Stripe | `phases/06-stripe.md` | [ ] | |
| 07 — Ops glue (dunning) | `phases/07-ops-glue.md` | [ ] | |
| 08 — E2E & Definition of Done | `phases/08-e2e-dod.md` | [ ] | |

## Locked decisions (do NOT revisit)

- Auth: Better Auth (email/password), sessions via server functions.
- Payments: Stripe test mode; idempotent webhook at `/api/stripe/webhook`.
- DB: PostgreSQL (Docker locally → VPS later). No serverless, no Accelerate.
- Versions: Prisma 6.x, TypeScript strict (no `any`).

## Environment setup log

- Postgres via Docker: `docker run --name saas-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saas -p 5432:5432 -d postgres:16`
- `.env` created from `.env.example`: [ ]
- Secrets generated (`openssl rand -base64 32`): [ ]

## Notes / decisions log

| Date | Phase | Note |
| --- | --- | --- |
| | | |

## File change log (feeds the final report)

| Action | Path | Phase |
| --- | --- | --- |
| | | |

## Final report checklist

- [ ] All phases marked `[x]` with dates.
- [ ] DoD results (pass/fail per item) from `phases/08-e2e-dod.md`.
- [ ] Files created / modified / deleted listed path by path.
- [ ] Assumptions + scaffold conflicts and how they were resolved.
