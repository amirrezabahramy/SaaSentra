import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import { getAuthSession } from '#/lib/auth.functions'
import TypesafeI18n, { useI18nContext } from '#/i18n/i18n-react'
import { loadAllLocales } from '#/i18n/i18n-util.sync'
import type { Locales } from '#/i18n/i18n-types'
import { isLocale } from '#/i18n/i18n-util'
import { LOCALE_STORAGE_KEY } from '#/lib/i18n'
import { useEffect, useState } from 'react'

interface MyRouterContext {
  queryClient: QueryClient
  auth: Awaited<ReturnType<typeof getAuthSession>>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => ({ auth: await getAuthSession() }),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const locale: Locales = 'en'
  loadAllLocales()

  return (
    <TypesafeI18n locale={locale}>
      <LocalizedDocument>{children}</LocalizedDocument>
    </TypesafeI18n>
  )
}

function LocalizedDocument({ children }: { children: React.ReactNode }) {
  const { locale, setLocale } = useI18nContext()
  const [isLocaleReady, setIsLocaleReady] = useState(false)

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (storedLocale && isLocale(storedLocale) && storedLocale !== locale) {
      setLocale(storedLocale)
    }
    setIsLocaleReady(true)
  }, [locale, setLocale])

  return (
    <html lang={locale} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
      <head>
        <HeadContent />
      </head>
      <body>
        {isLocaleReady ? children : <LocaleLoading />}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

function LocaleLoading() {
  return (
    <main className="app-launch-loader" aria-busy="true" aria-live="polite">
      <span className="app-launch-loader__indicator" aria-hidden="true" />
    </main>
  )
}
