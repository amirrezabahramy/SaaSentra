# Phase 00 — Scaffold & Dependencies

**Goal:** A bootable TanStack Start app with all v1 dependencies merged in,
without touching the scaffold's structure or config.

**Depends on:** nothing. **Feeds:** every later phase.

## Steps

1. Confirm the scaffold exists (`package.json`, `tsconfig.json`, `vite.config.ts`,
   router config) and `npm run dev` boots a welcome page before any changes.
2. `npm install` with the scaffold's package.json as-is; fix any pre-existing
   install errors before adding dependencies.
3. **Merge** (never overwrite) these dependencies into `package.json`:
   - runtime: `@prisma/client`, `bcryptjs`, `stripe`, `zod`, `better-auth`
     (plus whatever Better Auth requires), `node-cron`
   - dev: `prisma`, `@types/bcryptjs`, `@types/node-cron`
   - Then `npm install` again and confirm zero peer-conflict errors.
4. Integrate the starter files into the app:
   - `prisma/schema.prisma`, `prisma/seed.ts` (see phase 01)
   - `src/db.ts` — keep the singleton pattern exactly as-is (contract rule 4)
   - `.env.example` — copy in; do not commit `.env`
5. Add npm scripts (merge, don't clobber):
   `"db:migrate": "prisma migrate dev"`, `"db:seed": "tsx prisma/seed.ts"`.
6. Create `.env` from `.env.example`; generate real secrets with
   `openssl rand -base64 32` for `BETTER_AUTH_SECRET`, `ENTITLEMENT_SHARED_SECRET`,
   `STRIPE_WEBHOOK_SECRET`. Leave Stripe keys as test placeholders for now.
7. Note every modified scaffold file in `PROGRESS.md` → File change log.

## Verification

- `npm run dev` boots with no errors.
- `npx tsc --noEmit` exits 0 (strict mode).
- `package.json` contains all scaffold deps it started with + the new ones.
- `PROGRESS.md` status board row 00 is updated.

## Do not

- Run `npm create @tanstack/start` or recreate scaffold defaults.
- Overwrite scaffold `package.json`, `tsconfig.json`, `vite.config.ts`.
- Commit or generate `.env` values into the repo.
