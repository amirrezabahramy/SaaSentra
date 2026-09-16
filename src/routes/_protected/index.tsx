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

export const Route = createFileRoute('/_protected/')({
  loader: ({ context }) => context.queryClient.query(overviewQuery()),
  pendingComponent: Loading,
  errorComponent: ({ error }) => <ErrorState message={String(error)} />,
  component: Overview,
})

function Overview() {
  const { data } = useSuspenseQuery(overviewQuery())
  const queryClient = useQueryClient()
  const runNow = useServerFn(runDunningNow)
  const dunningMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          Console overview
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">Good morning</h1>
        <p className="mt-2 text-(--sea-ink-soft)">
          A live view of revenue, customers, and account health.
        </p>
      </header>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-(--sea-ink-soft)">
          Dunning queue: {data.dunningQueue} tenant(s)
        </p>
        <button
          type="button"
          onClick={() => void dunningMutation.mutateAsync()}
          disabled={dunningMutation.isPending}
          className="rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white"
        >
          Run dunning now
        </button>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Monthly recurring revenue"
          value={formatCurrency(data.mrrCents)}
        />
        <Metric
          label="Active subscriptions"
          value={String(data.activeSubscriptions)}
        />
        <Metric label="Dunning queue" value={String(data.dunningQueue)} />
      </section>
      <section className="mt-8 rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold">Recent audit activity</h2>
        {data.recentAudit.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No audit activity"
              description="Lifecycle and operational events will appear here."
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
                    {entry.reason ?? entry.entityType ?? 'System event'}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
      <p className="text-sm text-(--sea-ink-soft)">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  )
}
function Loading() {
  return (
    <div className="animate-pulse text-(--sea-ink-soft)">Loading overview…</div>
  )
}
function ErrorState({ message }: { message: string }) {
  return <EmptyState title="Unable to load overview" description={message} />
}
