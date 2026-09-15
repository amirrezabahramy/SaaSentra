# Phase 04 — Entitlements API (service control)

**Goal:** The single service-control endpoint live and byte-exact against the
contract in `BLUEPRINT.md` §6.

**Depends on:** Phases 01–03. **Feeds:** 08 (DoD 3 & 5).

## Steps

1. Copy `src/routes/api/v1/entitlements/$tenantId.ts` into the scaffold;
   adapt imports to the scaffold's route/file conventions.
2. Route: `GET /api/v1/entitlements/:tenantId`, guarded by header
   `x-entitlement-secret: $ENTITLEMENT_SHARED_SECRET`.
   - Wrong/missing secret → `401` (do not leak tenant existence).
   - Unknown tenantId → `404`.
3. Response 200 JSON shape, exactly:
   `{ "active": true, "plan": "pro", "flags": { "allow_api_access": true }, "periodEnd": "2026-10-01T00:00:00.000Z" }`
   - `active` from `getEntitlement()` (Phase 02 logic).
   - `flags` = per-tenant overrides merged over flag definitions.
4. Performance/path: this is called on every external request — one tenant
   lookup + subscription + flags; no N+1s, no user session required.
5. Add a smoke script or curl block to `README.md` showing the exact call.

## Verification

- Correct secret + demo tenant → 200 with the exact shape above
  (`active:true`, `plan:"pro"`, `flags` object, ISO `periodEnd`).
- Missing/wrong secret → 401. Bogus tenantId → 404.
- Set demo subscription status to DISABLED → endpoint returns `active:false`;
  set it back via `transitionSubscription()` → `active:true`.
- `npx tsc --noEmit` exits 0.

## Do not

- Return internal fields (internal ids beyond tenantId, emails, invoices).
- Skip the shared-secret check or log the secret.
