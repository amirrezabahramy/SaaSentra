import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { EmptyState } from '#/components/admin/empty-state'
import { servicesQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'

export const Route = createFileRoute('/_protected/services')({
  loader: ({ context }) => context.queryClient.query(servicesQuery()),
  component: Services,
})
function Services() {
  const { LL } = useI18nContext()
  const { data: rows } = useSuspenseQuery(servicesQuery())
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.services.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.services.title()}
        </h1>
      </header>
      {rows.length === 0 ? (
        <EmptyState
          title={LL.services.noServices()}
          description={LL.services.noServicesDescription()}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-(--line) bg-(--surface) p-6"
            >
              <div className="flex justify-between gap-3">
                <h2 className="font-serif text-2xl font-bold">{row.name}</h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {row.deployStatus}
                </span>
              </div>
              <p className="mt-2 text-sm text-(--sea-ink-soft)">
                {row.tenantName} · {row.controlType}
              </p>
              <div className="mt-5 rounded-xl bg-white/50 p-4 text-sm">
                <p className="font-semibold">
                  {LL.services.entitlement()}:{' '}
                  {row.entitlement.active
                    ? LL.services.active()
                    : LL.services.inactive()}
                </p>
                <p className="mt-1 text-(--sea-ink-soft)">
                  {LL.services.plan()}:{' '}
                  {row.entitlement.plan ?? LL.services.none()} ·{' '}
                  {Object.keys(row.entitlement.flags).length}{' '}
                  {LL.services.flags()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
