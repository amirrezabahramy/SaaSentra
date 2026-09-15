# Phase 02 — Domain Logic (Lifecycle & Dunning)

**Goal:** The subscription state machine and dunning logic compile and behave
exactly as specified — before any UI or Stripe exists.

**Depends on:** Phase 01. **Feeds:** 04, 05b, 06, 07, 08.

## Steps

1. Copy `src/lib/lifecycle.ts` and `src/lib/dunning.ts` into the scaffold
   (adapt import paths/file conventions only — not the logic).
2. `lifecycle.ts` must export:
   - `ALLOWED_TRANSITIONS` — the full transition table:
     `ACTIVE → PAST_DUE | CANCELED`; `PAST_DUE → GRACE_PERIOD | ACTIVE (payment ok)`;
     `GRACE_PERIOD → DISABLED | ACTIVE`; `DISABLED → ACTIVE | ARCHIVED`
     (admin re-enable); `CANCELED → DISABLED_AT_PERIOD_END`;
     `DISABLED_AT_PERIOD_END → DISABLED`; `ARCHIVED` is terminal.
   - `transitionSubscription()` — validates the transition against the table,
     throws on anything not allowed, writes an `AuditLog` row on every call
     (who / when / why / from → to), and is idempotent-safe (no-op instead of
     throw when target state already equals current state).
   - `getEntitlement()` — returns `{ active, plan, flags, periodEnd }`;
     `active` = status ACTIVE (or DISABLED_AT_PERIOD_END before period end)
     AND now < periodEnd. Re-enable target: ACTIVE, or DISABLED_AT_PERIOD_END
     if the customer had canceled.
3. `dunning.ts` must export `runDunning()`:
   - PAST_DUE >3 days → GRACE_PERIOD; grace expired → DISABLED (sets `disabledAt`).
   - Notice placeholders at T-7 / T-3 / T-1 (log/email stub — Resend later).
   - All moves go **through `transitionSubscription()`** — never a raw
     `prisma.subscription.update`.
4. Add a tiny server-function wrapper or script (`runDunning()` callable from
   cron and manually) for phase 07 to wire up.
5. TypeScript strict, no `any`; server-only — no Prisma imports in client code.

## Verification

- `npx tsc --noEmit` exits 0.
- Illegal transition (e.g. `ACTIVE → DISABLED` direct) throws.
- `PAST_DUE → GRACE_PERIOD` via `transitionSubscription()` writes exactly one
  new `AuditLog` row with actor, reason, from → to.
- Calling `runDunning()` twice on the same data does not duplicate transitions
  or audit rows.
- A quick script or test confirms `getEntitlement()` returns `active:false`
  when status is DISABLED.

## Do not

- Bypass `transitionSubscription()` anywhere in app code (contract rule 2).
- Ship raw `prisma.subscription.update` calls outside the state machine.
