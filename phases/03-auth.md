# Phase 03 — Auth (Better Auth)

**Goal:** Login works, sessions flow through the root loader, and all admin
pages are protected.

**Depends on:** Phases 00–02. **Feeds:** 04, 05a, 05b.

## Steps

1. Install/configure Better Auth for email/password (test credentials come
   from the seed admin: `ADMIN_EMAIL` + its seeded password).
2. Server side: signup/login/logout **server functions**; session cookie
   managed by Better Auth; `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` from `.env`.
3. Root loader: populate `context.auth` with the current user (or null).
4. Protect the app with `src/routes/_protected.tsx`:
   unauthenticated → redirect to `/login`; authenticated → sidebar + `<Outlet />`.
5. Build `/login` (email + password form → server function → redirect).
6. Gate UI actions on `context.auth` role where useful; v1 does not need full
   RBAC (the `OWNER|ADMIN` enum is enough).
7. No Prisma imports in any client component — auth calls go through
   server functions only.

## Verification

- `npm run dev` → `/login` renders; logging in with the seeded admin works.
- Visiting `/`, `/tenants`, `/audit` while logged out redirects to `/login`.
- Logging out clears the session; back-navigation does not leak protected pages.
- `npx tsc --noEmit` exits 0.

## Do not

- Roll your own session crypto or store raw passwords (bcryptjs hashing only).
- Expose Better Auth config or Prisma client to client bundles.
- Block on RBAC/permission tables — the `OWNER|ADMIN` enum is enough for v1.
