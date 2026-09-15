# Phase 07 — Ops Glue (Dunning cron + docs + polish)

**Goal:** The lifecycle runs on its own: past-due tenants degrade gracefully,
get noticed, and get disabled only after grace expires.

**Depends on:** Phases 02, 06. **Feeds:** 08 (DoD 7).

## Steps

1. Wire `runDunning()` (Phase 02) to a scheduler:
   - node-cron every 4h: `"0 */4 * * *"`, started from a server entrypoint that
     runs in dev and in the Docker/VPS process — not in the client bundle.
   - OR document the `pg_cron` equivalent in `README.md`; either is acceptable
     per `INSTRUCTIONS.md` step 9.
2. Dunning behavior (already in Phase 02; verify end-to-end here):
   PAST_DUE >3 days → GRACE_PERIOD → (grace expired) → DISABLED with
   `disabledAt` set; notices at T-7 / T-3 / T-1 (email placeholders log clearly).
3. `README.md` final pass: full setup (Docker Postgres, `.env`, migrate, seed,
   Stripe CLI, cron), the entitlement curl example, and the manual dunning run.
4. Ops niceties: a "Run dunning now" admin action on `/` or `/subscriptions`
   calling the same `runDunning()` (audited, idempotent), plus a visible count
   of tenants currently in dunning.
5. Health check: `GET /api/health` returning `{ ok: true }` (no secrets).

## Verification

- Seed a PAST_DUE subscription with a past grace timestamp → run dunning →
  it lands in GRACE_PERIOD with an AuditLog row; advance past grace → DISABLED
  with `disabledAt` set.
- Running dunning twice changes nothing the second time (idempotent).
- Cron log shows the 4h schedule firing in dev; manual trigger works from the UI.
- `README.md` instructions work when followed top-to-bottom on a clean checkout.
- `npx tsc --noEmit` exits 0.

## Do not

- Cut a customer silently — notices + audit rows always (grace periods &
  notices are a hard rule).
- Put the scheduler in middleware or a client-side module.
