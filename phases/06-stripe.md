# Phase 06 — Stripe (test mode)

**Goal:** Test checkout creates a subscription → webhook flips it to ACTIVE —
and replaying events changes nothing.

**Depends on:** Phases 01–05b. **Feeds:** 07, 08 (DoD 6).

## Steps

1. Stripe test-mode keys in `.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
2. Checkout server function: create a Stripe Checkout Session (test mode)
   for a tenant + plan price ID; return the session URL. Store the session
   reference on the Subscription/Invoice row.
3. Webhook handler at `POST /api/stripe/webhook`:
   - **Raw-body verification** with `STRIPE_WEBHOOK_SECRET` (mount it so the
     framework does not pre-parse the body).
   - **Idempotency:** persist processed event IDs; a replayed event is a no-op
     (contract rule 3). Return 200 for known-and-handled; ignore unrelated events.
   - Map events → `transitionSubscription()` (never raw updates):
     `checkout.session.completed` / `customer.subscription.created|updated` →
     ACTIVE; `invoice.payment_failed` → PAST_DUE;
     `customer.subscription.deleted` → CANCELED (then flow continues via dunning).
   - Mirror invoice/payment data into `Invoice` / `Payment` rows (ids, amounts,
     status) — Stripe stays the source of truth, DB mirrors it.
4. Update the seed so the `pro` plan carries its real test-mode price ID.
5. Local testing: Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`).
   Document the exact commands in `README.md`.

## Verification

- Test checkout completes → subscription ACTIVE, invoice + payment mirrored.
- `stripe trigger invoice.payment_failed` → PAST_DUE via a proper AuditLog row.
- Replay the same event (CLI trigger twice or resend the payload) →
  zero new audit rows, zero state changes, HTTP 200.
- Invalid signature → 400, nothing processed.
- `npx tsc --noEmit` exits 0.

## Do not

- Trust amounts/statuses from the client; only from verified webhook payloads.
- Skip signature verification in dev "temporarily".
- Add customer portal, usage metering, or customer webhooks (out of scope).
