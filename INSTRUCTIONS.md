# Build Instructions — SaaSentra Dashboard v1 (Agent Contract)

> Read this file first. It is the binding contract for this build.
> Companion: `BLUEPRINT.md` (same folder) — architecture rationale, diagrams, DoD.
> Source of truth for the data model: `prisma/schema.prisma`. Never two sources.

## 0. Context

- You are building **v1 of the SaaSentra dashboard** — an internal ops console
  (control plane) for running a subscription business: tenants, subscriptions,
  billing, services, feature flags, audit trail.
- The project scaffold **already exists**: a fresh **TanStack Start (full-stack,
  TypeScript) app** created by the user with the official script
  `npm create @tanstack/start@latest`.
- **Your job starts AFTER scaffolding.** Do NOT run the scaffold script. Do NOT
  recreate or delete the scaffold's default structure. Preserve its config files
  (tsconfig, vite.config, router config) unless a genuine conflict forces a change
  — and if you change anything, say so in your final report.
- This folder contains the **source-of-truth starter files**. Integrate them into
  the scaffold. Do not re-invent them; adapt them to the scaffold if needed
  (import paths, file conventions) — not the other way around.

## 1. Source-of-truth files (this folder)

| File                                          | What it defines                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                        | 12 models + enums. **Never modify without asking.**                                   |
| `prisma/seed.ts`                              | Admin, 2 plans, feature flags, demo tenant + subscription + service, audit entry.     |
| `src/db.ts`                                   | PrismaClient singleton (dev-safe).                                                    |
| `src/lib/lifecycle.ts`                        | State machine: `ALLOWED_TRANSITIONS`, `transitionSubscription()`, `getEntitlement()`. |
| `src/lib/dunning.ts`                          | Dunning cron PAST_DUE→GRACE_PERIOD→DISABLED + email placeholders.                     |
| `src/routes/_protected.tsx`                   | Protected layout: auth check + sidebar + `<Outlet />`.                                |
| `src/routes/api/v1/entitlements/$tenantId.ts` | The single service-control endpoint.                                                  |
| `.env.example`                                | Every env var the app needs.                                                          |
| `README.md`                                   | Human-oriented setup notes (Stripe, dunning).                                         |
| `BLUEPRINT.md`                                | Architecture + scope lock + Definition of Done.                                       |

## 2. Resolved decisions (locked — do NOT revisit, do NOT re-ask)

| Decision   | Choice                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Auth       | **Better Auth** (email/password). Sessions via server functions.                                                            |
| Payments   | **Stripe test mode.** Checkout session → webhook → subscription state. Idempotent webhook handler at `/api/stripe/webhook`. |
| Deployment | **Local dev first** (Postgres via Docker). VPS + Docker later. NO serverless, NO Prisma Accelerate in v1.                   |
| Versions   | Prisma 6.x, TypeScript strict (no `any`).                                                                                   |

## 3. Hard rules

1. **No hard deletes.** State machine only: ACTIVE → PAST_DUE → GRACE_PERIOD → DISABLED → ARCHIVED (and CANCELED → DISABLED_AT_PERIOD_END → DISABLED).
2. **Every subscription state change goes through `transitionSubscription()`** (lifecycle.ts) — it writes the AuditLog. Never bypass it with a raw `prisma.subscription.update`.
3. **Idempotency:** Stripe webhook events and disable/re-enable actions must be safe to run twice.
4. Keep the `src/db.ts` singleton pattern as-is.
5. **Prisma is server-only.** Never import it into client components. Mutations = server functions; reads = loaders. Validate inputs with Zod.
6. **Merge `package.json` deps** — never overwrite the scaffold's existing dependencies or config.
7. In the final report, list every file created/modified/deleted plus every assumption you made.

## 4. Build steps (ordered)

1. `npm install`. Then add missing deps (merge — do not clobber): `prisma`, `@prisma/client`, `bcryptjs`, `stripe`, `zod`, and whatever Better Auth requires.
2. Copy `prisma/schema.prisma` into the project → `npx prisma migrate dev --name init` → `npx prisma generate`.
3. Copy `src/db.ts`, `src/lib/lifecycle.ts`, `src/lib/dunning.ts`, `prisma/seed.ts`.
4. Create `.env` from `.env.example`; generate real secrets (`openssl rand -base64 32`).
5. Wire **Better Auth**: signup/login/logout server functions; configure the root loader so `context.auth` carries the user; protect the `_protected` layout; add `/login`.
6. Build the **9 v1 routes** (replace the scaffold welcome page): `/login` · `/` (overview) · `/tenants` · `/tenants/:id` (lifecycle timeline + disable/re-enable) · `/subscriptions` · `/services` · `/flags` · `/audit` · `/settings`.
7. Copy `src/routes/_protected.tsx` and `src/routes/api/v1/entitlements/$tenantId.ts`; adapt imports to the scaffold's conventions.
8. **Stripe:** checkout server function; webhook handler with raw-body verification + processed-event idempotency (store event ids); map events → `transitionSubscription`.
9. **Dunning:** wire `runDunning()` to a cron (node-cron, every 4h: `0 */4 * * *`) — or document the pg_cron equivalent in README.
10. **Seed:** `npm run db:seed` (needs `DATABASE_URL` + `ADMIN_EMAIL`).

## 5. Definition of Done — verify ALL in order; report pass/fail per item

1. `npm install` and `npx prisma migrate dev` exit 0.
2. `npm run db:seed` exits 0 (admin, 2 plans, demo tenant, demo service).
3. `npm run dev` boots; `/login` renders; unauthenticated access to protected routes redirects to `/login`.
4. `curl -H "x-entitlement-secret: $ENTITLEMENT_SHARED_SECRET" http://localhost:3000/api/v1/entitlements/<tenantId>` returns 200 with `{"active":true,"plan":"pro","flags":{...},"periodEnd":"..."}`.
5. `transitionSubscription` PAST_DUE→GRACE_PERIOD creates an AuditLog row (verify in DB).
6. Setting the demo subscription to DISABLED makes the endpoint return `"active":false`.
7. Stripe test checkout → webhook → subscription ACTIVE, and replaying the same webhook event does nothing (idempotent).

## 6. Out of scope — do NOT build

Customer portal (`/app` routes), usage metering, customer webhooks, API keys,
full RBAC (role enum `OWNER|ADMIN` is enough), multi-service control UI.
`UsageEvent`, `WebhookSubscription`, `WebhookDelivery`, `ApiKey`, `Ticket`,
`RolePermission` are **not** part of v1 — do not add them to the schema or app.

## 7. Final report format

- Files created / modified / deleted (path by path).
- DoD results: pass/fail per item with exact output.
- Assumptions + scaffold conflicts and how you resolved them.
