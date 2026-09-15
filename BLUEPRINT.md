# SaaS Management Dashboard — Blueprint & Scope Lock (v1)

Companion to `INSTRUCTIONS.md`. Humans read this to understand the system;
agents read INSTRUCTIONS.md to build it. `prisma/schema.prisma` is the single
source of truth for the data model.

## 1. What we are building

An internal ops dashboard ("control plane") for running a subscription SaaS
business: tenants, subscriptions, billing, service control, feature flags, and
a full audit trail. Built with **TanStack Start** (full-stack, TypeScript),
**Prisma ORM**, **PostgreSQL**.

The founding loop this whole v1 exists to serve:

    sign-up → tenant + trial → pay (Stripe) → service runs (entitlement check)
    → payment fails → past_due → grace emails → auto-disable → service stops
    → admin re-enables after payment → every step in the audit log

## 2. Why PostgreSQL (not SQLite)

- RLS-ready (row-level security for future multi-tenant scale), safe concurrency
  for billing/usage writes, `pg_cron` for dunning jobs, JSONB for flexible data.
- Prisma has no native RLS support → tenant scoping is enforced in code
  (base-query wrapper). Not a v1 blocker: v1 is an internal tool.
- v1 setup: Postgres in Docker locally → Postgres on a VPS later. No serverless,
  no Prisma Accelerate.

## 3. V1 route map (9 routes)

| Route                            | Page          | Purpose                                                             |
| -------------------------------- | ------------- | ------------------------------------------------------------------- |
| `/login`                         | Auth          | Email/password session (Better Auth)                                |
| `/`                              | Overview      | MRR, active subs, dunning queue, recent audit                       |
| `/tenants`                       | Tenants       | List / search tenants                                               |
| `/tenants/:id`                   | Tenant detail | Lifecycle timeline, status, disable/re-enable, services, invoices   |
| `/subscriptions`                 | Subscriptions | All subscriptions, filter by state                                  |
| `/services`                      | Services      | Controlled services + entitlement status (v1: one — `demo-web-app`) |
| `/flags`                         | Feature flags | Toggle per-tenant flag overrides                                    |
| `/audit`                         | Audit         | Every state transition: who / when / why                            |
| `/settings`                      | Settings      | Team + env hints                                                    |
| `/api/v1/entitlements/:tenantId` | API (no UI)   | Service-control endpoint (shared secret)                            |

## 4. Data model (12 models — exact fields in schema.prisma)

| Model                          | Role                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `User`, `Tenant`, `Membership` | People & tenancy (role `OWNER                                            | ADMIN`, unique user+tenant) |
| `Plan`, `Subscription`         | The state-machine core (status, currentPeriod*, graceEndsAt, disabledAt) |
| `Invoice`, `Payment`           | Stripe mirror rows (ids + amounts + status)                              |
| `Service`, `ServiceAction`     | Service control record + manual-action log                               |
| `FeatureFlag`, `TenantFlag`    | Flag definitions + per-tenant overrides                                  |
| `AuditLog`                     | Every transition (indexed by tenantId + createdAt)                       |

Reserved for later (do NOT add in v1): `UsageEvent`, `WebhookSubscription`,
`WebhookDelivery`, `ApiKey`, `Ticket`, `RolePermission`.

## 5. Lifecycle state machine

                 payment fails               >3 days past due
    ACTIVE ───────────────────► PAST_DUE ─────────────────────► GRACE_PERIOD
      ▲  ▲                          │                              │
      │  └──── payment ok ──────────┘                              │
      │                             │              grace expired   │
      │  ┌──────────────────────────┴──────────────────────────────▼
      │  │                                                     DISABLED
      │  │                                                         │  ▲
      └──┴────────────── admin re-enable (payment ok) ─────────────┘  │
                                                                      │
    ACTIVE ──► CANCELED ──► DISABLED_AT_PERIOD_END ──► DISABLED ──► ARCHIVED

Rules:

- Transition table enforced in `lifecycle.ts` (`ALLOWED_TRANSITIONS`); anything
  else throws.
- Every transition runs through `transitionSubscription()` → writes AuditLog.
- Dunning cron every 4h: PAST_DUE → GRACE_PERIOD (3 days) → DISABLED
  (sets `disabledAt`).
- Notices at T-7 / T-3 / T-1 (email placeholders in `dunning.ts`, Resend later).
- Re-enable = one transition back to ACTIVE (or DISABLED_AT_PERIOD_END if the
  customer had canceled).

## 6. Service control — the one endpoint

External services ask on every request:

    GET /api/v1/entitlements/:tenantId
    Header: x-entitlement-secret: <ENTITLEMENT_SHARED_SECRET>

Response 200 OK:

    { "active": true, "plan": "pro", "flags": { "allow_api_access": true }, "periodEnd": "2026-10-01T00:00:00.000Z" }

- `active` = subscription is ACTIVE (or DISABLED_AT_PERIOD_END before period
  end) AND now < periodEnd.
- **Disabling a customer = one row update** (`Subscription.status → DISABLED`).
  No SSH, no process kills, no webhook fan-out in v1.
- The `Service` model is generic, so adding services later is **data, not
  architecture**.

## 7. Hard rules (even in v1)

1. No hard deletes — soft state, archive only.
2. Every disable/enable is reversible and audited.
3. Idempotency: Stripe events + disable actions safe to run twice.
4. Prisma server-only; mutations = server functions; Zod validation.
5. Grace periods & notices always — never cut a customer silently.

## 8. Definition of Done (v1 ships when ALL pass)

1. `npx prisma migrate dev` and `npm run db:seed` exit 0.
2. `/login` works; protected routes redirect when unauthenticated.
3. Entitlement endpoint returns the exact 200 shape above.
4. Every transition writes an AuditLog row.
5. Disabling flips `active` to `false` on the endpoint.
6. Stripe test checkout → webhook → ACTIVE, replay-safe.
7. Dunning cron moves PAST_DUE → GRACE_PERIOD → DISABLED with audit rows.

## 9. Three decisions (locked — change here if you disagree)

| Decision   | Locked choice                                                |
| ---------- | ------------------------------------------------------------ |
| Auth       | Better Auth (email/password)                                 |
| Payments   | Stripe test mode → idempotent webhook handler                |
| Deployment | Docker Postgres locally → VPS + Docker. No serverless in v1. |

## 10. Deferred (schema-reserved, later iterations)

Customer portal (`/app`), usage metering & rollups, customer webhooks, API keys
& scopes, full RBAC, multi-service control UI. None of these change the
12-model core — the schema already reserves them.

## 11. Why this is not incomplete

The loop is named, models locked (12), endpoint contract fixed, routes scoped
(9), decisions made, and the DoD is machine-verifiable. The remaining work is
building — not analysis.
