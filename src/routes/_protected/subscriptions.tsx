import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { StatusBadge } from '#/components/admin/status-badge'
import { EmptyState } from '#/components/admin/empty-state'
import { formatCurrency, formatDate } from '#/lib/format'
import { subscriptionsQuery } from '#/lib/queries'

export const Route = createFileRoute('/_protected/subscriptions')({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search.status === 'string' ? search.status : '',
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) =>
    context.queryClient.query(subscriptionsQuery(deps.status)),
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
  const search = Route.useSearch()
  const { data: rows } = useSuspenseQuery(subscriptionsQuery(search.status))
  const navigate = Route.useNavigate()
  const form = useForm({
    defaultValues: { status: search.status },
    onSubmit: ({ value }) =>
      navigate({ search: (previous) => ({ ...previous, status: value.status }) }),
  })
  return (
    <Page title="Subscriptions" kicker="Billing operations">
      <form className="mb-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
        <form.Field name="status">
          {(field) => <select
          name={field.name}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
          className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3"
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll('_', ' ')}
            </option>
          ))}
        </select>}
        </form.Field>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit, isSubmitting]) => <button disabled={!canSubmit || isSubmitting} className="rounded-xl bg-[var(--sea-ink)] px-5 font-semibold text-white">
          Filter
          </button>}
        </form.Subscribe>
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
