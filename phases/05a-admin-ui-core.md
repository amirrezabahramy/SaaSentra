# Phase 05a — Admin UI Core (Overview, Tenants, Subscriptions)

**Goal:** The read-mostly backbone of the console, replacing the scaffold
welcome page.

**Depends on:** Phases 01–04. **Feeds:** 05b, 08 (DoD 2 & 3 UI surface).

## Steps

1. All pages live inside the `_protected` layout (Phase 03). Reads = loaders;
   mutations = server functions with Zod validation.
2. Build:
   - `/` **Overview** — MRR, active subscription count, dunning queue size
     (PAST_DUE + GRACE_PERIOD), recent audit entries.
   - `/tenants` — tenant list + search (by name/email), status badges.
   - `/tenants/:id` — tenant detail: lifecycle timeline (from AuditLog,
     newest first), current subscription status card, invoices list,
     services + flags summary.
3. Shared bits: sidebar nav (all 9 routes), status badge component mapping
   the subscription enum to colors, empty-state components.
4. MRR = sum of `plan.price` for subscriptions in ACTIVE and
   DISABLED_AT_PERIOD_END (before period end). Keep the formula in one util.
5. Loading and error states for every loader; no unhandled rejections.
6. Strict TypeScript; no `any`; date rendering via a single shared formatter.

## Verification

- All three routes render for the logged-in admin with seeded data.
- `/` numbers match direct DB queries (spot-check with `prisma studio`).
- `/tenants/:id` timeline shows the seeded AuditLog entry with actor + reason.
- Unauthenticated access still redirects to `/login`.
- `npx tsc --noEmit` exits 0.

## Do not

- Add mutations here that belong in 05b (disable/re-enable, flag toggles).
- Show hard-deleted rows or fake data — everything comes from Prisma loaders.
