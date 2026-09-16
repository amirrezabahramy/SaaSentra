import { createFileRoute, redirect, Link, Outlet } from '@tanstack/react-router'
import BetterAuthHeader from '#/integrations/better-auth/header-user'
import { useI18nContext } from '#/i18n/i18n-react'
import { LanguageSwitcher } from '#/components/language-switcher'

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
  const { LL } = useI18nContext()
  const links = [
    [LL.nav.overview(), '/'],
    [LL.nav.tenants(), '/tenants'],
    [LL.nav.subscriptions(), '/subscriptions'],
    [LL.nav.services(), '/services'],
    [LL.nav.flags(), '/flags'],
    [LL.nav.audit(), '/audit'],
    [LL.nav.settings(), '/settings'],
  ] as const

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-(--line) bg-(--surface) p-5 backdrop-blur lg:min-h-screen lg:border-b-0 lg:border-r">
        <Link to="/" className="font-serif text-2xl font-bold text-(--sea-ink)">
          {LL.app.name()}
        </Link>
        <div className="mt-4">
          <LanguageSwitcher />
        </div>
        <nav className="mt-8 flex gap-2 overflow-x-auto lg:block">
          {links.map(([label, href]) => (
            <Link
              key={href}
              to={href}
              className="block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-(--sea-ink-soft) hover:bg-white/70 hover:text-(--sea-ink)"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 hidden lg:block">
          <BetterAuthHeader />
        </div>
      </aside>
      <main className="min-w-0 p-5 sm:p-8">
        <div className="mb-5 flex justify-end lg:hidden">
          <BetterAuthHeader />
        </div>
        <Outlet />
      </main>
    </div>
  )
}
