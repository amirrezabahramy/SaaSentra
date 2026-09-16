import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'

import { LanguageSwitcher } from '#/components/language-switcher'
import { useI18nContext } from '#/i18n/i18n-react'
import BetterAuthHeader from '#/integrations/better-auth/header-user'
import { SIDEBAR_STORAGE_KEY } from '#/lib/i18n'

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
  const location = useLocation()
  const [isMobileViewport, setIsMobileViewport] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 1023px)').matches,
  )
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true)

  useEffect(() => {
    const storedSidebarState = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)

    if (storedSidebarState === 'false') {
      setIsDesktopSidebarOpen(false)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches)
      if (!event.matches) {
        setIsMobileSidebarOpen(false)
      }
    }

    mediaQuery.addEventListener('change', handleViewportChange)
    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  }, [])

  useEffect(() => {
    if (isMobileViewport) {
      setIsMobileSidebarOpen(false)
    }
  }, [isMobileViewport, location.pathname])

  const isSidebarOpen = isMobileViewport
    ? isMobileSidebarOpen
    : isDesktopSidebarOpen

  const updateSidebarState = (isOpen: boolean) => {
    if (isMobileViewport) {
      setIsMobileSidebarOpen(isOpen)
      return
    }

    setIsDesktopSidebarOpen(isOpen)
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isOpen))
  }

  const links = [
    [LL.nav.overview(), '/'],
    [LL.nav.tenants(), '/tenants'],
    [LL.nav.subscriptions(), '/subscriptions'],
    [LL.nav.plans(), '/plans'],
    [LL.nav.services(), '/services'],
    [LL.nav.flags(), '/flags'],
    [LL.nav.audit(), '/audit'],
    [LL.nav.settings(), '/settings'],
  ] as const

  return (
    <div
      className={`dashboard-shell h-dvh overflow-hidden ${
        isSidebarOpen ? 'sidebar-open' : ''
      }`}
    >
      {isSidebarOpen ? (
        <button
          type="button"
          aria-label={LL.nav.closeMenu()}
          className="dashboard-sidebar-overlay"
          onClick={() => updateSidebarState(false)}
        />
      ) : null}

      <aside
        className={`dashboard-sidebar-drawer ${isSidebarOpen ? 'is-open' : ''}`}
        aria-hidden={!isSidebarOpen}
      >
        <SidebarContent links={links} />
      </aside>

      <main className="dashboard-content h-dvh min-h-0 min-w-0 overflow-y-auto">
        <div className="dashboard-toolbar">
          <button
            type="button"
            aria-label={isSidebarOpen ? LL.nav.closeMenu() : LL.nav.openMenu()}
            aria-expanded={isSidebarOpen}
            className="rounded-lg border border-(--line) bg-white/50 p-2 text-(--sea-ink) hover:bg-white/80"
            onClick={() => updateSidebarState(!isSidebarOpen)}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="dashboard-content-body p-5 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

type SidebarLink = readonly [label: string, href: string]

function SidebarContent({ links }: { links: readonly SidebarLink[] }) {
  const { LL } = useI18nContext()

  return (
    <>
      <Link to="/" className="font-serif text-2xl font-bold text-(--sea-ink)">
        {LL.app.name()}
      </Link>
      <div className="mt-4">
        <LanguageSwitcher />
      </div>
      <nav className="mt-8 grid gap-2">
        {links.map(([label, href]) => (
          <Link
            key={href}
            to={href}
            className="block rounded-xl px-3 py-2 text-sm font-semibold text-(--sea-ink-soft) hover:bg-white/70 hover:text-(--sea-ink)"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-8">
        <BetterAuthHeader />
      </div>
    </>
  )
}
