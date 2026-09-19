# Remaining Security and Production Hardening

Last reviewed: September 19, 2026

This document records the security work that remains after the initial security audit. Items marked as open should be completed and verified before production launch.

## High priority

### 1. Replace the global service secret — addressed September 19, 2026

Current state: payment checkout, checkout-status, and delivery requests use a
unique API key per service. The database stores only a bcrypt hash and the
dashboard exposes the raw key only when a service is created or its key is
rotated. The legacy `SERVICE_SECRET` environment variable is no longer used.

Risk: if one connected service is compromised, an attacker may use the shared secret to access payment and checkout APIs for other services.

Implementation:

- Added a unique `svc_...` credential per service.
- Store only a bcrypt hash, last four characters, creation timestamp, and revocation timestamp.
- Show the credential once when it is created or regenerated.
- Support rotation; the previous credential stops working immediately.
- Bind checkout, checkout-status, and delivery requests to the service ID and credential.
- Preserve the `x-service-secret` header name for existing headless integrations; its value is now the service-specific key.
- Existing services created before this migration must rotate their key before using these payment APIs.

Acceptance criteria:

- [x] A credential for Service A cannot access Service B data.
- [x] Revoked credentials immediately stop working.
- [x] Credential rotation does not expose the previous secret.
- [x] No raw service credentials are returned by dashboard loaders or APIs.

### 2. Use shared rate-limit storage in production — addressed September 19, 2026

Current state: login, entitlement, and checkout rate limits are persisted in the database through `RateLimitBucket`, so limits survive restarts and are shared by application instances using the same database.

Risk: limits reset on restart and are not shared between multiple application instances.

Implementation:

- Added database-backed rate-limit buckets.
- Rate-limit by a combination of IP, credential identity, service ID, and tenant ID where appropriate.
- Keep stricter limits for authentication and serial-key submission.

Acceptance criteria:

- [x] Limits remain effective after an application restart.
- [x] Limits are shared across all production instances using the same database.
- [x] Legitimate services are not blocked by a single shared IP.
- [x] `429` responses include a safe retry indication without leaking internal details.

### 3. Complete provider callback and webhook verification in staging — partially verified September 19, 2026

Current state: local signed webhook/callback processing, amount validation, tamper rejection, replay protection, and Zibal test-mode settlement have been verified. A real Stripe Test-mode Checkout was paid successfully, but Stripe cannot deliver its webhook to the local server until a public tunnel or Stripe CLI forwarder is configured.

Required tests:

- [x] Stripe successful Test-mode Checkout payment.
- [x] Stripe signed webhook settlement fixture.
- [x] Stripe amount tampering rejection.
- [x] Stripe webhook replay.
- [ ] Stripe external webhook delivery from Test mode through a tunnel/Stripe CLI.
- [x] Zibal test payment and callback using the `zibal` merchant.
- [x] Zibal callback replay and tampering.
- [x] Payment delivery record after each successful provider flow.

Acceptance criteria:

- [x] A browser redirect alone never activates a subscription.
- [x] Only a verified provider callback/webhook can settle payment.
- [x] Duplicate provider events do not create duplicate invoices, payments, serial keys, or deliveries.
- [x] Amount, currency, plan, tenant, and service are validated before activation.

## Medium priority

### 4. Move dunning notices to a real delivery system — implemented September 19, 2026

Current state: dunning notices are persisted and sent through the configured Nodemailer/SMTP provider. Each notice has a unique subscription/type/period key, delivery status, attempt count, safe error text, and retry timestamp.

Risk: customers may not receive payment-failure, grace-period, or suspension notices.

Recommended fix:

- [x] Send notices through the existing Nodemailer/SMTP abstraction or a transactional email provider.
- [x] Add a delivery record with status, attempts, timestamps, and safe error information.
- [x] Retry transient failures with bounded exponential backoff.
- [x] Prevent duplicate notices for the same subscription, notice type, and period.

Acceptance criteria:

- [x] Every required notice is either delivered or recorded as failed/not configured.
- [x] Failed delivery does not crash the dunning scan.
- [x] Re-running dunning does not send duplicate notices.
- [x] Email content does not contain secrets or unnecessary internal IDs.

### 5. Add outbound network controls for callbacks

Current state: callback URLs are validated against HTTPS and private-network targets, and redirects are not followed.

Risk: DNS can change after validation, and application-level checks are not a complete network boundary.

Recommended fix:

- Restrict production egress at the host/container/network level.
- Resolve and validate callback destinations immediately before delivery.
- Consider an allowlist of verified callback domains per service.
- Add request timeout, response-size limits, and bounded retry behavior.

Acceptance criteria:

- Callback delivery cannot reach private, loopback, link-local, or cloud metadata addresses.
- Redirects are rejected.
- Large or slow callback responses do not exhaust resources.

### 6. Add complete automated security and integration coverage

Current state: focused security regression tests exist, but there is no complete provider and browser-level security suite.

Required coverage:

- Owner/Admin/Tenant authorization boundaries.
- Cross-tenant and cross-service IDOR attempts.
- Archived-record behavior.
- CSRF protection for server functions.
- Authentication throttling.
- Serial-key persistence and leakage prevention.
- Stripe and Zibal success, failure, tampering, and replay.
- Email, callback, and callback-plus-email delivery.
- Production-like migration and clean-database startup.

Acceptance criteria:

- Tests run in CI on every change.
- Tests use isolated data and do not require production credentials.
- Provider tests use test-mode credentials only.

## Operational requirements

These are not application-code fixes, but they are required before production:

- Rotate all local/test secrets and configure production secrets in a secret manager.
- Use a production `BETTER_AUTH_SECRET` and production `BETTER_AUTH_URL`.
- Configure Stripe webhook signing secrets and Zibal callback URLs.
- Configure SMTP with SPF, DKIM, and DMARC.
- Enable PostgreSQL backups and test restoring them.
- Restrict database network access and database permissions.
- Add monitoring for authentication failures, webhook failures, payment failures, delivery failures, and dunning failures.
- Ensure only one effective dunning scheduler runs across production instances, or move dunning to a distributed job system.
- Review retention and deletion rules for invoices, payments, audit logs, and personal data.

## Already addressed in the initial audit

- Operator authorization for dashboard server functions.
- Tenant/Admin dashboard access boundary.
- Explicit CSRF middleware for server functions.
- Security response headers.
- Basic login, entitlement, and checkout rate limits.
- Stripe webhook signature validation.
- Atomic Stripe webhook replay protection.
- Checkout service isolation.
- Archived tenant/subscription suppression in entitlement and Stripe lookup paths.
- Safer malformed JSON responses.
- Callback URL validation and redirect blocking.
- Serial-key restriction for email-only checkout status responses.
- Bcrypt password hashing verification.

## Validation commands

Run these after completing each item:

```bash
npm run format
npm run typecheck
npm run lint
npm run build
npm run test:security
npm run db:status
```
