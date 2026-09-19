# SaaSentra Dashboard

[فارسی](README.fa.md) · English

A TanStack Start + Prisma starter for multi-tenant SaaS: subscriptions, invoices,
payments, entitlements, feature flags, and a subscription lifecycle with dunning
and grace periods.

## Project guide

### What this project does

The SaaSentra dashboard is a SaaS management control plane for an owner or operator
who owns multiple products. For example, the operator may own a café website,
a sports equipment store, and an online clothing store. Each product can be
registered as a service and integrated with this dashboard.

The operator’s developers integrate those websites with the entitlement API.
When the operator changes a customer’s subscription or access status in this
dashboard, the connected website receives the new entitlement result and can
allow, limit, or block that customer’s access in its own UI.

### Core concepts

- **Dashboard owner/operator** — the person or company that owns the products
  and uses this dashboard to manage customer access.
- **Tenant** — a customer organization or account whose access is managed by
  the operator.
- **Service** — one of the operator’s reusable connected products, such as a
  café, sports, or clothing website. A service owns its name and shared flag
  definitions and is identified by `serviceId`; the same service can be
  assigned to multiple tenants.
- **TenantService assignment** — the tenant-specific connection between a
  tenant and a service. It owns that connection’s API key, deploy status,
  payment delivery mode, callback URL/secret, and enabled flags.
- **Plan** — a reusable commercial definition: price, currency, provider, plan
  type, and duration.
- **Subscription** — the tenant’s assignment to a plan. It owns the lifecycle
  status, period dates, serial key, cancellation state, and payment history.
- **Flag** — a feature definition belonging to a service, such as
  `advanced_reports` or `team_members`. Each tenant can independently enable
  or disable that service’s flags.
- **Entitlement** — the server-to-server result that tells a service whether
  access is active and which flags it may enable.
- **Invoice and payment** — financial records created after verified provider
  settlement. A browser redirect alone never activates a subscription.

The current data model gives each tenant one subscription relation at a time.
Services are reusable product definitions. A `TenantService` assignment grants
a tenant access to a service and stores the tenant-specific integration
configuration. Its related flag assignments control which service features
that tenant can use.
The entitlement request is scoped by both `tenantId` and `serviceId`, so one
website cannot use another website’s service credential or entitlement scope.
Feature flags are also scoped to the requested service, so two services
belonging to the same tenant may receive different flags.
The subscription status itself is currently tenant-level: changing the
subscription status affects the tenant’s connected services. A future
per-service subscription model would require a schema change.

### Dashboard sections

| Section       | Purpose                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Overview      | MRR, active subscriptions, dunning queue, and recent audit activity.                                |
| Tenants       | Create and manage customer organizations, billing email, status, subscriptions, and tenant details. |
| Plans         | Define subscription or serial-key plans, pricing, currency, provider, and duration.                 |
| Subscriptions | Inspect and manage plan assignments, lifecycle status, periods, serial keys, and payments.          |
| Services      | Register reusable products and define their shared service flags.                                   |
| Flags         | Assign services to tenants, configure each assignment, rotate its credential, and toggle its flags. |
| Audit         | Review lifecycle, payment, credential, and administrative activity.                                 |
| Settings      | Review application-level operational settings and configuration information.                        |

Owner and admin users operate the dashboard. Tenant users belong to a customer
tenant and are kept separate from operator access; they do not receive access
to the SaaSentra dashboard by default.

### Subscription and access statuses

| Status                   | Meaning for a connected service                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `ACTIVE`                 | Access is active while the plan period is valid.                                                       |
| `TRIALING`               | Access is active during the trial period.                                                              |
| `PAST_DUE`               | A payment problem is recorded; access remains active only while the current period is still valid.     |
| `GRACE_PERIOD`           | Access is inactive until a successful payment resolves the grace state.                                |
| `DISABLED`               | Access is inactive.                                                                                    |
| `CANCELED`               | The subscription is canceled and cannot be reactivated through payment.                                |
| `DISABLED_AT_PERIOD_END` | Access behaves as active before the period ends and inactive afterward; the status value is preserved. |
| `ARCHIVED`               | The record is treated as nonexistent by entitlement and payment APIs.                                  |

`active` is the authoritative access decision for a connected service. The
returned `status` and `reason` provide additional context for displaying a
message or deciding whether to show a payment action.

### Recommended operator workflow

1. Register each owned product in **Services**. For example, register the café,
   sports, and clothing websites as separate services.
2. Use **Flags** to assign each service to the tenants that may use it. Configure
   delivery mode, callback settings, deploy status, and the tenant-service API
   key for each assignment. The key is shown only when created or regenerated.
3. Give the connected website developer that assignment’s `serviceId` and API
   key. A shared service may therefore have a different key for every tenant.
4. Create plans in **Plans** and configure their provider-specific details.
5. Create customer tenants in **Tenants** and assign their subscriptions.
6. Integrate the entitlement check into each website’s server-side request flow.
7. Use the returned `active`, `status`, `reason`, and `flags` values to enforce
   access and feature limits in that website’s own design.
8. Manage access from this dashboard. For example, disabling a tenant’s
   subscription makes the entitlement response inactive for the connected
   service.
9. Optionally use the headless checkout flow when customers need to pay or
   renew from the connected website.

Keep all shared secrets and service credentials on the server. Do not expose
them in browser JavaScript or public client-side environment variables.

### Entitlement integration

The cross-origin entitlement route is:

```text
GET /api/v1/entitlements/:tenantId
```

Required headers:

```text
x-entitlement-secret: <shared entitlement secret>
x-service-id: <registered service id>
x-service-secret: <tenant-service API key>
```

For serial-key plans, the service may also send:

```text
x-serial-key: <customer-entered serial key>
```

A successful response contains fields such as:

```json
{
  "active": true,
  "plan": "pro",
  "planType": "SUBSCRIPTION",
  "status": "ACTIVE",
  "reason": "ACTIVE",
  "periodEnd": "2026-10-19T12:00:00.000Z",
  "flags": {
    "advanced_reports": true
  }
}
```

For a serial-key plan, the API returns matching/submission booleans but never
returns the secret serial key itself. Archived tenants and subscriptions are
reported as inactive and do not leak archived records.

### Serial-key submission

Serial-key services can submit a customer-entered key through:

```text
POST /api/v1/entitlements/:tenantId
```

Use the same authentication headers and send:

```json
{ "serialKey": "customer-entered-key" }
```

The submitted value is persisted against the subscription. It is not stored in
a cookie or environment variable, and the actual generated key is not returned
by the entitlement API.

### Headless payment integration

Create a checkout from the customer application’s server side:

```text
POST /api/v1/payments/checkout
```

Headers:

```text
x-service-id: <registered service id>
x-service-secret: <tenant-service API key>
```

Request body:

```json
{
  "tenantId": "<tenant id>",
  "serviceId": "<service id>",
  "planId": "<plan id>",
  "returnUrl": "https://customer-app.example/payment-result"
}
```

The response contains a provider checkout URL and `checkoutId`. Redirect the
customer to the provider URL. The provider webhook or callback verifies and
settles the payment; do not mark the subscription active based only on the
customer returning to your website.

After the customer returns, query:

```text
GET /api/v1/payments/checkouts/:checkoutId
```

using the same service headers. A successful checkout can optionally trigger
configured callback delivery through:

```text
POST /api/v1/payments/checkouts/:checkoutId/deliver
```

The tenant-service assignment’s configured payment delivery mode controls
whether the result is delivered by callback, email, or both. Provider webhooks must be publicly
reachable in deployment and must use the correct signing or verification
configuration.

### Service deployment status

Each tenant-service assignment has an operational status of `HEALTHY`,
`DEGRADED`, or `OFFLINE`. These values are dashboard labels and are not
currently included in the entitlement response. Entitlement `active` describes
subscription authorization, not application uptime.

### Repository structure

```text
.
├── prisma/
│   ├── migrations/          # Versioned database schema changes
│   ├── schema.prisma        # Domain model and enums
│   ├── seed.ts              # Demo data seed
│   └── owner.seed.ts        # Owner-only seed
├── src/
│   ├── routes/              # Dashboard pages and server API routes
│   ├── lib/                 # Domain, payment, auth, query, and utility logic
│   ├── components/          # Shared UI components
│   ├── integrations/        # Better Auth and TanStack integrations
│   ├── i18n/                # English and Persian translations
│   ├── db.ts                # Prisma client singleton
│   └── env.ts               # Validated environment configuration
├── docker/
│   ├── entrypoint.sh        # Migrate then start the production server
│   └── postgres-init/       # PostgreSQL initialization scripts
├── Dockerfile               # Multi-stage production image
├── docker-compose.yml       # App + PostgreSQL deployment
├── scripts/                 # Operational scripts and production checks
├── tests/security/          # Security and integration tests
└── README.md                # This guide
```

### Where to extend the project

- Add business rules in `src/lib/`, not directly inside UI components.
- Add dashboard pages under `src/routes/_protected/`.
- Add external API routes under `src/routes/api/`.
- Keep Prisma access server-only.
- Add schema changes through a named Prisma migration.
- Add translations to both `src/i18n/en/` and `src/i18n/fa/`.
- Add security-sensitive behavior with regression tests in `tests/security/`.
- Keep payment-provider behavior behind the provider adapters in
  `src/lib/payments/`.

## Stack

- [TanStack Start](https://tanstack.com/start) (Nitro/Vite)
- Prisma ORM + PostgreSQL
- node-cron for the dunning job

## Setup

### 1. Create the app (scaffold reference)

```bash
npm create @tanstack/start@latest my-saas-app
# then copy prisma/, src/ and this README into the scaffold
npm install @prisma/client prisma node-cron
npm install -D @types/node-cron tsx
```

### 2. Run the app and Postgres with Docker Compose

This repository includes a production-oriented `Dockerfile` and
`docker-compose.yml`. Postgres is private to the Compose network; only the app
port is published to the host.

```bash
cp .env.docker.example .env.docker
# Edit .env.docker and replace every placeholder secret.
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker logs -f app
```

The same workflow is available through package scripts:

```bash
npm run docker:deploy  # build the final image, migrate, and start the stack
npm run docker:ps      # inspect app and database health
npm run docker:logs    # follow application logs
npm run docker:seed    # optional demo seed
npm run docker:down    # stop the stack; preserves the database volume
```

The app container waits for Postgres, runs `prisma migrate deploy`, and starts
the built TanStack Start server. The first database initialization also creates
the Prisma shadow database. Use `docker compose --env-file .env.docker down` to stop the stack; add
`--volumes` only when you intentionally want to delete the PostgreSQL data.

To load the demo data after the first startup:

```bash
docker compose --env-file .env.docker exec app npx prisma db seed
```

### 3. Environment

For local development, copy `.env.example` to `.env.local`. For Docker, copy
`.env.docker.example` to `.env.docker` and fill in:

- `DATABASE_URL` — Postgres connection string
- Each tenant-service assignment has its own generated API key. Store the key in that tenant's connected service and send it as the `x-service-secret` header for entitlement, checkout, and payment-delivery APIs.
- Configure delivery mode, callback URL/secret, deploy status, and key rotation from the tenant assignment on the Flags page.
- For local seed testing, optionally set `DEMO_SERVICE_API_KEY`; the seed copies it to each demo tenant assignment.
- `STRIPE_SECRET_KEY` — Stripe API key for billing
- `STRIPE_WEBHOOK_SECRET` — signing secret for Stripe webhooks

### 4. Migrate & seed

```bash
npx prisma migrate dev --name init
# add "prisma": { "seed": "tsx prisma/seed.ts" } to package.json, then:
npx prisma db seed
# or run the seeder directly:
npx tsx prisma/seed.ts
```

### 5. Dev server

```bash
npm run dev
```

### 6. Check a tenant entitlement

```bash
curl -sS \
  -H "x-entitlement-secret: $ENTITLEMENT_SHARED_SECRET" \
  -H "x-service-id: $SERVICE_ID" \
  -H "x-service-secret: $TENANT_SERVICE_API_KEY" \
  "http://localhost:3000/api/v1/entitlements/$TENANT_ID"
```

### 7. Stripe test-mode webhook testing

Set real Stripe test-mode values in the Stripe plans from the dashboard’s Plans
section, then reseed only if you want to restore the default demo plan records:

```bash
npm run db:seed
```

Install and authenticate the Stripe CLI, then forward events to the raw-body
webhook route:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` value printed by `stripe listen` into
`STRIPE_WEBHOOK_SECRET` in `.env.local`, restart the dev server, and trigger a
test failure:

```bash
stripe trigger invoice.payment_failed
```

The webhook rejects invalid signatures with HTTP 400. Replaying the same event
ID returns HTTP 200 without adding another processed-event audit entry or
transitioning the subscription again. A Checkout Session is created through
the headless checkout route described above. The Stripe webhook route remains
the authoritative settlement path.

### 8. Dunning and health checks

Dunning runs in the server process every four hours at minute zero. The same
job can be run manually from the Overview page or with the exported
`runDunning()` function. It moves subscriptions through the lifecycle, records
transitions in `AuditLog`, and logs the T-7 / T-3 / T-1 notice placeholders.

Run it directly against `.env.local` with:

```bash
npx dotenv -e .env.local -- tsx scripts/run-dunning.ts
```

Check server health with:

```bash
curl -sS http://localhost:3000/api/health
```

Expected response:

```json
{ "ok": true, "database": "ok" }
```

## Architecture notes

### The entitlement endpoint must be a server ROUTE, not a server function

`src/routes/api/v1/entitlements/$tenantId.ts` is a server **route** on purpose.
External services must be able to call it **cross-origin** with the
`x-entitlement-secret` header. Server functions are designed for the app's own
client bundle and are not a stable cross-origin API surface — keep entitlement
checks as a route and authenticate with the shared secret.

### Serverless deploys need connection pooling

On serverless platforms (Vercel/Lambda/Cloudflare Workers) every instance opens
its own Postgres connections and quickly exhausts `max_connections`. Use one of:

- **Prisma Postgres / Prisma Accelerate** (managed pooling, works everywhere)
- **PgBouncer** in transaction mode, with
  `?pgbouncer=true&connection_limit=1&sslmode=require` appended to `DATABASE_URL`

### Run migrations over a direct connection

`prisma migrate dev` / `prisma migrate deploy` require advisory locks that
transaction-pooled connections (PgBouncer in transaction mode) break. Always run
migrations against a **direct** (non-pooled) connection — e.g. keep a separate
`DIRECT_URL` env var pointing straight at the database.

## Key modules

- `src/lib/lifecycle.ts` — legal status `TRANSITIONS` plus `disable`, `enable`,
  `markPastDue` and `enterGracePeriod`; every change runs inside
  `db.$transaction` and writes an `AuditLog` row. `GRACE_NOTICE_DAYS = [7, 3, 1]`.
- `src/lib/dunning.ts` — a daily node-cron job that scans `PAST_DUE` and
  `GRACE_PERIOD` subscriptions, sends configured grace notices at T-7 / T-3 /
  T-1, records delivery outcomes, and auto-disables subscriptions whose grace
  period has passed.
- `src/db.ts` — PrismaClient singleton cached on `globalThis` in development.
