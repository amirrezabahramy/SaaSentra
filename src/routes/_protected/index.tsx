import { createFileRoute } from '@tanstack/react-router'
import { getOverview } from '#/lib/admin.functions'
import { EmptyState } from '#/components/admin/empty-state'
import { formatCurrency, formatDate } from '#/lib/format'

export const Route = createFileRoute('/_protected/')({
  loader: () => getOverview(),
  pendingComponent: Loading,
  errorComponent: ({ error }) => <ErrorState message={String(error)} />,
  component: Overview,
})

function Overview() {
  const data = Route.useLoaderData()
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">Console overview</p><h1 className="mt-2 font-serif text-4xl font-bold">Good morning</h1><p className="mt-2 text-[var(--sea-ink-soft)]">A live view of revenue, customers, and account health.</p></header>
      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Monthly recurring revenue" value={formatCurrency(data.mrrCents)} />
        <Metric label="Active subscriptions" value={String(data.activeSubscriptions)} />
        <Metric label="Dunning queue" value={String(data.dunningQueue)} />
      </section>
      <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold">Recent audit activity</h2>
        {data.recentAudit.length === 0 ? <div className="mt-5"><EmptyState title="No audit activity" description="Lifecycle and operational events will appear here." /></div> : <div className="mt-4 divide-y divide-[var(--line)]">{data.recentAudit.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 py-4"><div><p className="font-semibold">{entry.action}</p><p className="text-sm text-[var(--sea-ink-soft)]">{entry.reason ?? entry.entityType ?? 'System event'}{entry.actor ? ` · ${entry.actor.name ?? entry.actor.email}` : ''}</p></div><time className="text-sm text-[var(--sea-ink-soft)]">{formatDate(entry.createdAt)}</time></div>)}</div>}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm"><p className="text-sm text-[var(--sea-ink-soft)]">{label}</p><p className="mt-3 text-3xl font-bold">{value}</p></div> }
function Loading() { return <div className="animate-pulse text-[var(--sea-ink-soft)]">Loading overview…</div> }
function ErrorState({ message }: { message: string }) { return <EmptyState title="Unable to load overview" description={message} /> }
