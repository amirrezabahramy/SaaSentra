# Phase 05b — Admin UI Ops (Actions, Services, Flags, Audit, Settings)

**Goal:** Every operator action the founding loop needs — disable, re-enable,
flag toggles, full audit visibility.

**Depends on:** Phase 05a. **Feeds:** 08 (DoD 4 & 5).

## Steps

1. Build:
   - `/subscriptions` — all subscriptions, filter by status
     (ACTIVE / PAST_DUE / GRACE_PERIOD / DISABLED / CANCELED /
     DISABLED_AT_PERIOD_END / ARCHIVED).
   - `/services` — controlled services + per-tenant entitlement status
     (v1: one service, `demo-web-app` — "adding services is data, not architecture").
   - `/flags` — flag definitions + per-tenant override toggles.
   - `/audit` — full audit trail, filterable by tenant + action; who / when / why.
   - `/settings` — team members (Membership list) + env hints (which vars must
     be set; never print secret values).
2. Mutations (server functions + Zod, all via `transitionSubscription()`):
   - Disable / re-enable from `/tenants/:id` — confirm dialog, required
     "reason" field (goes into AuditLog).
   - Re-enable targets ACTIVE, or DISABLED_AT_PERIOD_END if the customer had
     canceled (Phase 02 logic).
   - Toggle a per-tenant flag override → write TenantFlag + AuditLog row.
3. Idempotency: pressing disable twice must not error or duplicate audit rows.
4. After every mutation: revalidate the affected loaders; show success/error
   toasts; never leave stale status badges on screen.

## Verification

- Disable the demo tenant from the UI → status badge flips to DISABLED,
  AuditLog row appears in `/audit` with actor + reason, and the Phase 04
  endpoint now returns `active:false`.
- Re-enable (with reason) → ACTIVE again, endpoint `active:true`.
- Double-clicking disable/re-enable does not throw or duplicate audit rows.
- Flag toggle persists and shows up in the endpoint's `flags` object.
- `npx tsc --noEmit` exits 0.

## Do not

- Bypass `transitionSubscription()` from any server function (contract rule 2).
- Add hard deletes anywhere — archive/disable only (contract rule 1).
