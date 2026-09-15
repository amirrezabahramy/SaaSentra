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

| Phase                         | File                          | Status | Date       |
| ----------------------------- | ----------------------------- | ------ | ---------- |
| 00 — Scaffold & deps          | `phases/00-scaffold.md`       | [x]    | 2026-09-15 |
| 01 — Data layer               | `phases/01-data-layer.md`     | [x]    | 2026-09-15 |
| 02 — Domain logic             | `phases/02-domain-logic.md`   | [x]    | 2026-09-15 |
| 03 — Auth                     | `phases/03-auth.md`           | [x]    | 2026-09-15 |
| 04 — Entitlements API         | `phases/04-entitlements.md`   | [x]    | 2026-09-15 |
| 05a — Admin UI core           | `phases/05a-admin-ui-core.md` | [x]    | 2026-09-15 |
| 05b — Admin UI ops            | `phases/05b-admin-ui-ops.md`  | [x]    | 2026-09-15 |
| 06 — Stripe                   | `phases/06-stripe.md`         | [x]    | 2026-09-15 |
| 07 — Ops glue (dunning)       | `phases/07-ops-glue.md`       | [x]    | 2026-09-15 |
| 08 — E2E & Definition of Done | `phases/08-e2e-dod.md`        | [x]    | 2026-09-15 |

## Locked decisions (do NOT revisit)

- Auth: Better Auth (email/password), sessions via server functions.
- Payments: Stripe test mode; idempotent webhook at `/api/stripe/webhook`.
- DB: PostgreSQL (Docker locally → VPS later). No serverless, no Accelerate.
- Versions: Prisma 6.x, TypeScript strict (no `any`).

## Environment setup log

- Postgres via Docker: `docker run --name saas-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saas -p 5432:5432 -d postgres:16`
- `.env` created from `.env.example`: [x]
- Secrets generated (`openssl rand -base64 32`): [x]

## Notes / decisions log

| Date       | Phase | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-15 | 00    | Docker was waived by user for normal development. Resolved the extracted route collision by moving the protected layout to `/protected`; regenerated the route tree. Prisma Client generated successfully; the required `Tenant.serviceActions` inverse relation was already present in the schema. Fixed extracted TypeScript issues in `src/lib/lifecycle.ts` and the protected redirect. Verification passed: `npx tsc --noEmit`, `npm run dev`. Phase 1 entry point: `phases/01-data-layer.md`, starting with its first unchecked step.                                                                                                                    |
| 2026-09-15 | 01    | Schema validates and contains exactly 12 required models. Added nullable `Plan.stripePriceId` to support the phase-1 Stripe price IDs and updated the seed to use `ADMIN_EMAIL`, seed `allow_api_access`, create an ACTIVE `pro` demo subscription, create `demo-web-app`, and upsert one deterministic AuditLog row. Repaired `.env` line endings and configured Prisma to use the existing `SHADOW_DATABASE_URL`. Postgres is reachable, but `prisma migrate dev --name init` is blocked because non-superuser `amirreza` lacks `CREATE/USAGE` on schema `public` (owned by `pg_database_owner`). Seed execution and double-run verification remain pending. |
| 2026-09-15 | 01    | Retried after the user reported migration completion. The configured database is `saas_management_service_db` as user `amirreza`; migration `20260915154306_init` is present but not applied there, and `prisma migrate deploy` still fails with permission denied on schema `public`. Seed cannot run because `public.Plan` does not exist.                                                                                                                                                                                                                                                                                                                   |
| 2026-09-15 | 01    | User confirmed migration and seed completion. Phase 1 accepted; proceeding to phase 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-15 | 02    | Replaced the incomplete lifecycle implementation with `ALLOWED_TRANSITIONS`, idempotent `transitionSubscription`, audit logging, entitlement calculation, and re-enable targeting. Reworked dunning to export `runDunning`, move PAST_DUE subscriptions after three days, disable expired grace periods through the state machine, and emit T-7/T-3/T-1 notice stubs. Added `Subscription.disabledAt` plus migration `20260915170000_add_subscription_disabled_at`. `prisma validate`, `prisma generate`, `npx tsc --noEmit`, and diff checks pass. Database behavior verification is pending deployment of the new additive migration.                        |
| 2026-09-15 | 02    | User confirmed deployment. Using `.env.local`, migration status is up to date, both seed runs pass, and the database smoke test passes: illegal ACTIVE→DISABLED throws; PAST_DUE→GRACE_PERIOD writes one audit row; DISABLED entitlement is inactive; running dunning twice does not duplicate transitions.                                                                                                                                                                                                                                                                                                                                                    |
| 2026-09-15 | 03    | Added Better Auth Prisma persistence, bcryptjs email/password hashing, server-function session/login/logout wrappers, root auth context, protected pathless layout, and `/login`. Added and applied `20260915161237_add_better_auth`. Runtime checks passed: `/login` returned 200; logged-out `/` redirected to `/login`; seeded admin login created a session and authenticated `/` returned 200; logout cleared cookies and redirected back to `/login`.                                                                                                                                                                                                    |

| 2026-09-15 | 04 | Updated the service-control route to use `x-entitlement-secret`, delegate to `getEntitlement()`, return object-shaped per-tenant flags, and avoid session requirements. Added `ENTITLEMENT_SHARED_SECRET` configuration and README curl example. Validation passed. Runtime checks passed: valid request 200 with `active:true`, `plan:"pro"`, flags object, and ISO period end; missing/wrong secret 401; unknown tenant 404; state-machine disable returned `active:false`; restoring ACTIVE returned `active:true`. |
| 2026-09-15 | 05a | Started admin UI core. Added server-side overview/tenant loaders, centralized MRR/date/currency helpers, and shared admin status/empty-state components. |
| 2026-09-15 | 05a | Completed after user verification: Overview, Tenants, and Tenant Detail render with seeded data; MRR, tenant search/status badges, audit actor/reason timeline, empty/error/loading states, protected redirects, route generation, strict TypeScript, and dev boot all verified. Phase 1 entry point: `phases/05b-admin-ui-ops.md`, starting with its first unchecked step. |
| 2026-09-15 | 05b | Started admin UI operations. Added server-side loaders for subscriptions, services, flags, audit, and settings; lifecycle-backed subscription actions; audited tenant flag overrides; and the corresponding protected pages. `npm run generate-routes`, `npx tsc --noEmit`, and `npm run build` pass. |
| 2026-09-15 | 05b | Completed after user verification: subscription disable/re-enable works with styled confirmation and exact-text confirmation, flag toggles persist, audit entries show actor/reason, endpoint entitlement state updates, repeated actions are idempotent, and each operator disable produces one audit entry. Phase 06 entry point: `phases/06-stripe.md`, starting with its first unchecked step. |
| 2026-09-15 | 06 | Started Stripe test-mode integration. Added Checkout Session creation through Stripe REST, raw-body webhook signature verification, processed-event idempotency, lifecycle event mapping, and invoice/payment mirroring. |
| 2026-09-15 | 06 | Completed after user verification with Stripe CLI: test-mode configuration and webhook forwarding work; checkout/webhook flow, signature rejection, subscription lifecycle mapping, invoice/payment mirroring, and replay idempotency verified. Phase 07 entry point: `phases/07-ops-glue.md`, starting with its first unchecked step. |
| 2026-09-15 | 07 | Completed after user verification: four-hour dunning scheduler, manual dunning runner, Overview trigger, dunning queue count, health endpoint, grace-period transitions, disabledAt handling, notices, and idempotent reruns all pass. Phase 08 entry point: `phases/08-e2e-dod.md`, starting with its first unchecked step. |
| 2026-09-15 | 08 | Started final E2E and Definition of Done verification using `.env.local`. Non-destructive checks are being run first; shared database reset is intentionally not performed without explicit confirmation. |
| 2026-09-15 | 08 | Preliminary DoD results: `npm install` exited 0 (`up to date, audited 794 packages`); `prisma migrate dev` reported `Already in sync, no schema change or pending migration was found`; `npm run db:seed` reported `Seed complete: 2 plans, 5 flags, 3 tenants, 1 demo service, 1 audit log`; route generation, `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed. Read-only DB smoke query reported 2 plans, 3 tenants, 1 service, 3 ACTIVE subscriptions, and 43 audit rows. Final browser/Stripe founding-loop confirmation remains pending. |
| 2026-09-15 | 08 | Completed after user verification of the full founding loop: sign-in and protected redirects, Stripe checkout/webhook activation and replay idempotency, entitlement active/inactive responses, PAST_DUE → GRACE_PERIOD → DISABLED dunning with notices and audit rows, admin re-enable, and `/api/health` returning `{"ok":true}`. DoD 1–8 passed; no ship blockers found. |

## File change log (feeds the final report)

| Action   | Path                                                                          | Phase |
| -------- | ----------------------------------------------------------------------------- | ----- |
| modified | `src/lib/lifecycle.ts`                                                        | 00    |
| modified | `src/routeTree.gen.ts`                                                        | 00    |
| renamed  | `src/routes/_protected.tsx` → `src/routes/protected.tsx`                      | 00    |
| modified | `PROGRESS.md`                                                                 | 00    |
| modified | `.env.example`                                                                | 01    |
| modified | `prisma/schema.prisma`                                                        | 01    |
| modified | `prisma/seed.ts`                                                              | 01    |
| modified | `prisma.config.ts`                                                            | 01    |
| modified | `prisma/schema.prisma`                                                        | 02    |
| modified | `src/lib/lifecycle.ts`                                                        | 02    |
| modified | `src/lib/dunning.ts`                                                          | 02    |
| added    | `prisma/migrations/20260915170000_add_subscription_disabled_at/migration.sql` | 02    |
| modified | `PROGRESS.md`                                                                 | 02    |
| modified | `prisma/schema.prisma`                                                        | 03    |
| added    | `prisma/migrations/20260915161237_add_better_auth/migration.sql`              | 03    |
| modified | `src/lib/auth.ts`                                                             | 03    |
| added    | `src/lib/auth.functions.ts`                                                   | 03    |
| modified | `src/env.ts`                                                                  | 03    |
| modified | `src/routes/__root.tsx`                                                       | 03    |
| modified | `src/router.tsx`                                                              | 03    |
| renamed  | `src/routes/protected.tsx` → `src/routes/_protected.tsx`                      | 03    |
| renamed  | `src/routes/index.tsx` → `src/routes/_protected/index.tsx`                    | 03    |
| added    | `src/routes/login.tsx`                                                        | 03    |
| modified | `src/integrations/better-auth/header-user.tsx`                                | 03    |
| modified | `prisma/seed.ts`                                                              | 03    |
| modified | `.env.example`                                                                | 03    |
| modified | `package.json`                                                                | 03    |
| modified | `package-lock.json`                                                           | 03    |
| modified | `src/routeTree.gen.ts`                                                        | 03    |
| modified | `src/lib/lifecycle.ts`                                                        | 04    |
| modified | `src/env.ts`                                                                  | 04    |
| modified | `src/routes/api/v1/entitlements/$tenantId.ts`                                 | 04    |
| modified | `README.md`                                                                   | 04    |
| modified | `.env.example`                                                                | 04    |
| added    | `src/lib/admin.functions.ts`                                                  | 05a   |
| added    | `src/lib/metrics.ts`                                                          | 05a   |
| added    | `src/lib/format.ts`                                                           | 05a   |
| added    | `src/components/admin/status-badge.tsx`                                       | 05a   |
| added    | `src/components/admin/empty-state.tsx`                                        | 05a   |
| modified | `src/routes/_protected.tsx`                                                   | 05a   |
| modified | `src/routes/_protected/index.tsx`                                             | 05a   |
| added    | `src/routes/_protected/tenants/index.tsx`                                     | 05a   |
| added    | `src/routes/_protected/tenants/$id.tsx`                                       | 05a   |
| modified | `src/routeTree.gen.ts`                                                        | 05a   |
| modified | `PROGRESS.md`                                                                 | 05a   |
| added    | `src/lib/ops.functions.ts`                                                    | 05b   |
| added    | `src/routes/_protected/subscriptions.tsx`                                     | 05b   |
| added    | `src/routes/_protected/services.tsx`                                          | 05b   |
| added    | `src/routes/_protected/flags.tsx`                                             | 05b   |
| added    | `src/routes/_protected/audit.tsx`                                             | 05b   |
| added    | `src/routes/_protected/settings.tsx`                                          | 05b   |
| modified | `src/routes/_protected/tenants/$id.tsx`                                       | 05b   |
| modified | `src/lib/admin.functions.ts`                                                  | 05b   |
| modified | `src/routeTree.gen.ts`                                                        | 05b   |
| modified | `PROGRESS.md`                                                                 | 05b   |
| modified | `src/lib/lifecycle.ts`                                                        | 05b   |
| added    | `src/lib/stripe.ts`                                                           | 06    |
| added    | `src/lib/stripe.functions.ts`                                                 | 06    |
| added    | `src/routes/api/stripe/webhook.ts`                                            | 06    |
| modified | `src/routeTree.gen.ts`                                                        | 06    |
| modified | `prisma/seed.ts`                                                              | 06    |
| modified | `README.md`                                                                   | 06    |
| modified | `PROGRESS.md`                                                                 | 06    |
| modified | `src/lib/dunning.ts`                                                          | 07    |
| added    | `src/lib/dunning.functions.ts`                                                | 07    |
| added    | `src/server/dunning.ts`                                                       | 07    |
| added    | `src/routes/api/health.ts`                                                    | 07    |
| modified | `src/routes/_protected/index.tsx`                                             | 07    |
| added    | `scripts/run-dunning.ts`                                                      | 07    |
| modified | `README.md`                                                                   | 07    |
| modified | `src/routeTree.gen.ts`                                                        | 07    |
| modified | `PROGRESS.md`                                                                 | 07    |

## Definition of Done results

- DoD 1: PASS — `npm install`: `up to date, audited 794 packages`; `prisma migrate dev`: `Already in sync, no schema change or pending migration was found.`
- DoD 2: PASS — `npm run db:seed`: `Seed complete: 2 plans, 5 flags, 3 tenants, 1 demo service, 1 audit log.`
- DoD 3: PASS — `npm run dev` booted; `/login` rendered; logged-out protected routes redirected to `/login`.
- DoD 4: PASS — entitlement endpoint returned HTTP 200 with `{ active, plan, flags, periodEnd }`.
- DoD 5: PASS — `PAST_DUE → GRACE_PERIOD` produced an `AuditLog` row with actor, reason, and transition metadata.
- DoD 6: PASS — `DISABLED` entitlement returned `active:false`.
- DoD 7: PASS — Stripe test checkout/webhook activated the subscription; replay produced no state or audit changes.
- DoD 8: PASS — dunning moved `PAST_DUE → GRACE_PERIOD → DISABLED`, populated `disabledAt`, logged notices, and reran idempotently.

## Final report checklist

- [x] All phases marked `[x]` with dates.
- [x] DoD results (pass/fail per item) from `phases/08-e2e-dod.md`.
- [x] Files created / modified / deleted listed path by path.
- [x] Assumptions + scaffold conflicts and how they were resolved.
