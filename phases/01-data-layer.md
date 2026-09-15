# Phase 01 — Data Layer (Prisma + Postgres)

**Goal:** 12-model schema migrated into a running Postgres and seeded with
admin, plans, flags, and a demo tenant.

**Depends on:** Phase 00. **Feeds:** 02, 03, 04, 06, 07, 08.

## Steps

1. Start Postgres via Docker (see `PROGRESS.md` env setup log) and set
   `DATABASE_URL` in `.env` (e.g. `postgresql://postgres:postgres@localhost:5432/saas`).
2. Ensure `prisma/schema.prisma` is the **12 models** exactly:
   `User, Tenant, Membership, Plan, Subscription, Invoice, Payment, Service,
   ServiceAction, FeatureFlag, TenantFlag, AuditLog` (with the role enum
   `OWNER|ADMIN`). Do NOT add `UsageEvent`, `WebhookSubscription`,
   `WebhookDelivery`, `ApiKey`, `Ticket`, `RolePermission` — schema-reserved.
3. `npx prisma migrate dev --name init` → then `npx prisma generate`.
4. Wire `prisma/seed.ts` to seed: 1 admin user (from `ADMIN_EMAIL`), 2 plans
   (at minimum `starter` + `pro` with Stripe price IDs), the feature flags
   (`allow_api_access` at minimum), a demo tenant + demo subscription
   (`pro`, status ACTIVE) + demo service `demo-web-app`, and one demo AuditLog
   row. Idempotent: re-running the seed must not duplicate rows or error.
5. Add `"db:seed": "tsx prisma/seed.ts"` if not already present.
6. Keep `src/db.ts` as the only place a PrismaClient is constructed.

## Verification

- `npx prisma migrate dev` exits 0; `npx prisma studio` shows all 12 tables.
- `npm run db:seed` exits 0; run it twice → second run is a clean no-op.
- `npx prisma validate` exits 0; schema diff vs the starter file is empty
  (or every deviation is logged in `PROGRESS.md`).
- Demo subscription status is ACTIVE and its plan is `pro`.

## Do not

- Modify the schema without flagging it in `PROGRESS.md` (contract: "never
  modify without asking").
- Hard-delete anything (no `delete`, no `deleteMany` in app code — soft state only).
