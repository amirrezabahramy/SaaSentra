# SaaS Dashboard Starter

A TanStack Start + Prisma starter for multi-tenant SaaS: subscriptions, invoices,
payments, entitlements, feature flags, and a subscription lifecycle with dunning
and grace periods.

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

### 2. Run Postgres via docker compose

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: saas
      POSTGRES_PASSWORD: saas
      POSTGRES_DB: saas
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

```bash
docker compose up -d
```

### 3. Environment

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` — Postgres connection string
- `SERVICE_SECRET` — shared secret checked by the entitlement endpoint (`x-service-secret` header)
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
  "http://localhost:3000/api/v1/entitlements/$TENANT_ID"
```

### 7. Stripe test-mode webhook testing

Set real Stripe test-mode values in `.env.local`, including the `price_...` IDs
for `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO`, then reseed so the plan
records use those IDs:

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
the `createCheckoutSession` server function in
`src/lib/stripe.functions.ts`.

## Architecture notes

### The entitlement endpoint must be a server ROUTE, not a server function

`src/routes/api/v1/entitlements/$tenantId.ts` is a server **route** on purpose.
External services must be able to call it **cross-origin** with the
`x-service-secret` header. Server functions are designed for the app's own
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
  `GRACE_PERIOD` subscriptions, sends grace notices at T-7 / T-3 / T-1
  (stub `sendEmail` — wire in Resend/Postmark/SES) and auto-disables tenants
  whose `graceEndsAt` has passed.
- `src/db.ts` — PrismaClient singleton cached on `globalThis` in development.
