import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import BetterAuthHeader from '#/integrations/better-auth/header-user'

/**
 * Pathless protected layout: everything nested under it requires a session.
 */
export const Route = createFileRoute('/_protected')({
  beforeLoad: ({ context }) => {
    if (!context.auth) {
      throw redirect({ to: '/login' })
    }
  },
  component: ProtectedLayout,
})

function ProtectedLayout() {
  const links = [
    ['Overview', '/'],
    ['Tenants', '/tenants'],
    ['Subscriptions', '/subscriptions'],
    ['Services', '/services'],
    ['Flags', '/flags'],
    ['Audit log', '/audit'],
    ['Settings', '/settings'],
  ] as const

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--line)] bg-[var(--surface)] p-5 backdrop-blur lg:min-h-screen lg:border-b-0 lg:border-r">
        <a href="/" className="font-serif text-2xl font-bold text-[var(--sea-ink)]">
          Harbor Admin
        </a>
        <nav className="mt-8 flex gap-2 overflow-x-auto lg:block">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:bg-white/70 hover:text-[var(--sea-ink)]"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-8 hidden lg:block">
          <BetterAuthHeader />
        </div>
      </aside>
      <main className="min-w-0 p-5 sm:p-8">
        <div className="mb-5 flex justify-end lg:hidden"><BetterAuthHeader /></div>
        <Outlet />
      </main>
    </div>
  )
}
