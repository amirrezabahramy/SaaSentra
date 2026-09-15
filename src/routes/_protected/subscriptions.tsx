import { createFileRoute } from '@tanstack/react-router'
import { getSubscriptions } from '#/lib/ops.functions'
import { StatusBadge } from '#/components/admin/status-badge'
import { EmptyState } from '#/components/admin/empty-state'
import { formatCurrency, formatDate } from '#/lib/format'

export const Route = createFileRoute('/_protected/subscriptions')({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search.status === 'string' ? search.status : '',
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ deps }) =>
    getSubscriptions({
      data: { status: deps.status ? (deps.status as 'ACTIVE') : undefined },
    }),
  component: Subscriptions,
})

const statuses = [
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'DISABLED',
  'CANCELED',
  'DISABLED_AT_PERIOD_END',
  'ARCHIVED',
] as const
function Subscriptions() {
  const rows = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <Page title="Subscriptions" kicker="Billing operations">
      <form className="mb-5 flex gap-2" method="get">
        <select
          name="status"
          defaultValue={search.status}
          className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3"
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-[var(--sea-ink)] px-5 font-semibold text-white">
          Filter
        </button>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title="No subscriptions"
          description="No subscriptions match this filter."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">
          {rows.map((row) => (
            <a
              href={`/tenants/${row.tenantId}`}
              key={row.id}
              className="flex flex-wrap justify-between gap-3 p-5 hover:bg-white/60"
            >
              <div>
                <p className="font-semibold">{row.tenant.name}</p>
                <p className="text-sm text-[var(--sea-ink-soft)]">
                  {row.plan.name} · ends {formatDate(row.currentPeriodEnd)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span>{formatCurrency(row.plan.priceCents)}</span>
                <StatusBadge status={row.status} />
              </div>
            </a>
          ))}
        </div>
      )}
    </Page>
  )
}
function Page({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">
          {kicker}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">{title}</h1>
      </header>
      {children}
    </div>
  )
}
