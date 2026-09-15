# Phase 08 — E2E Run & Definition of Done

**Goal:** Prove the entire founding loop works end-to-end and produce the
final report.

**Depends on:** ALL previous phases.

## The founding loop (must run green, in order)

    sign-up → tenant + trial → pay (Stripe) → service runs (entitlement check)
    → payment fails → past_due → grace emails → auto-disable → service stops
    → admin re-enables after payment → every step in the audit log

## E2E script (execute exactly this)

1. Clean DB → migrate → seed.
2. Log in as admin at `/login`.
3. Stripe test checkout for the demo tenant → subscription ACTIVE.
4. `curl -H "x-entitlement-secret: $ENTITLEMENT_SHARED_SECRET" \
     http://localhost:3000/api/v1/entitlements/<tenantId>` →
   200 with `{"active":true,"plan":"pro","flags":{...},"periodEnd":"..."}`.
5. `stripe trigger invoice.payment_failed` → PAST_DUE; entitlement still active
   until grace rules kick in.
6. Run dunning (manual or wait for cron) → GRACE_PERIOD → DISABLED;
   endpoint now returns `"active":false`.
7. In `/tenants/:id`, re-enable with a reason → ACTIVE; endpoint `active:true`.
8. Replay the original webhook event → no changes (idempotent).
9. Open `/audit` → every step above has an AuditLog row with who / when / why.

## Definition of Done — record pass/fail with exact output in PROGRESS.md

- [ ] DoD 1: `npm install` and `npx prisma migrate dev` exit 0.
- [ ] DoD 2: `npm run db:seed` exits 0 (admin, 2 plans, demo tenant, demo service).
- [ ] DoD 3: dev server boots; `/login` renders; protected routes redirect when logged out.
- [ ] DoD 4: entitlement endpoint returns the exact 200 shape (BLUEPRINT §6).
- [ ] DoD 5: `transitionSubscription` PAST_DUE→GRACE_PERIOD writes an AuditLog row (verify in DB).
- [ ] DoD 6: DISABLED demo subscription makes the endpoint return `"active":false`.
- [ ] DoD 7: Stripe test checkout → webhook → ACTIVE, replay-safe.
- [ ] DoD 8: dunning moves PAST_DUE → GRACE_PERIOD → DISABLED with audit rows.

## Final report (per INSTRUCTIONS.md §7)

- Files created / modified / deleted — path by path (copy from PROGRESS.md log).
- DoD results: pass/fail per item with exact output.
- Assumptions + every scaffold conflict and how it was resolved.

## Ship blockers — any fail = not done

- Any hard delete in app code.
- Any state change bypassing `transitionSubscription()`.
- Webhook replay changing state.
- A customer reaching DISABLED without notice placeholders/audit rows.
