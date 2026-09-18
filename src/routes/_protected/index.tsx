import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { EmptyState } from '#/components/admin/empty-state'
import { formatCurrency, formatDate } from '#/lib/format'
import { runDunningNow } from '#/lib/dunning.functions'
import { overviewQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/')({
  loader: ({ context }) => context.queryClient.query(overviewQuery()),
  pendingComponent: Loading,
  errorComponent: ({ error }) => <ErrorState message={String(error)} />,
  component: Overview,
})

function Overview() {
  const { LL } = useI18nContext()
  const { data } = useSuspenseQuery(overviewQuery())
  const queryClient = useQueryClient()
  const runNow = useServerFn(runDunningNow)
  const [dunningMessage, setDunningMessage] = useState<string | null>(null)
  const dunningMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      setDunningMessage(
        `${LL.overview.dunningComplete()} (${result.movedToPastDue} past due, ${result.movedToGrace} grace, ${result.movedToDisabled} disabled)`,
      )
    },
  })
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.overview.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.overview.greeting()}
        </h1>
        <p className="mt-2 text-(--sea-ink-soft)">
          {LL.overview.description()}
        </p>
      </header>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-(--sea-ink-soft)">
          {LL.overview.dunningQueue()}: {data.dunningQueue}{' '}
          {LL.overview.tenants()}
        </p>
        <button
          type="button"
          onClick={() => void dunningMutation.mutateAsync()}
          disabled={dunningMutation.isPending}
          className="rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white"
        >
          {LL.overview.runDunning()}
        </button>
      </div>
      {dunningMutation.error ? (
        <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {LL.overview.dunningError()}
        </p>
      ) : dunningMessage ? (
        <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {dunningMessage}
        </p>
      ) : null}
      <section className="grid gap-4 md:grid-cols-3">
        <Metric
          label={LL.metrics.activeSubscriptions()}
          value={String(data.activeSubscriptions)}
        />
        <Metric
          label={LL.metrics.dunningQueue()}
          value={String(data.dunningQueue)}
        />
        <Metric
          label={LL.metrics.recurringRevenue()}
          value={formatRevenue(data.revenue.recurring)}
        />
        <Metric
          label={LL.metrics.nonRecurringValue()}
          value={formatRevenue(data.revenue.nonRecurring)}
        />
      </section>
      <section className="mt-8 rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold">
          {LL.overview.recentAudit()}
        </h2>
        {data.recentAudit.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={LL.overview.noAudit()}
              description={LL.overview.noAuditDescription()}
            />
          </div>
        ) : (
          <div className="mt-4 divide-y divide-(--line)">
            {data.recentAudit.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap justify-between gap-2 py-4"
              >
                <div>
                  <p className="font-semibold">{entry.action}</p>
                  <p className="text-sm text-(--sea-ink-soft)">
                    {entry.reason ??
                      entry.entityType ??
                      LL.overview.systemEvent()}
                    {entry.actor
                      ? ` · ${entry.actor.name ?? entry.actor.email}`
                      : ''}
                  </p>
                </div>
                <time className="text-sm text-(--sea-ink-soft)">
                  {formatDate(entry.createdAt)}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function formatRevenue(revenue: { USD: number; IRR: number }): string {
  const values = [
    revenue.USD ? formatCurrency(revenue.USD, 'USD') : null,
    revenue.IRR ? formatCurrency(revenue.IRR, 'IRR') : null,
  ].filter((value): value is string => Boolean(value))
  return values.length > 0 ? values.join(' · ') : '—'
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
      <p className="text-sm text-(--sea-ink-soft)">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  )
}
function Loading() {
  const { LL } = useI18nContext()
  return (
    <div className="animate-pulse text-(--sea-ink-soft)">
      {LL.overview.loading()}
    </div>
  )
}
function ErrorState({ message }: { message: string }) {
  const { LL } = useI18nContext()
  return <EmptyState title={LL.overview.unableToLoad()} description={message} />
}
