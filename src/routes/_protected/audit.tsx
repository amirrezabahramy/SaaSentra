import { createFileRoute } from '@tanstack/react-router'
import { getAudit } from '#/lib/ops.functions'
import { EmptyState } from '#/components/admin/empty-state'
import { formatDate } from '#/lib/format'

export const Route = createFileRoute('/_protected/audit')({
  validateSearch: (search: Record<string, unknown>) => ({
    tenantId: typeof search.tenantId === 'string' ? search.tenantId : '',
    action: typeof search.action === 'string' ? search.action : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getAudit({
      data: {
        tenantId: deps.tenantId || undefined,
        action: deps.action || undefined,
      },
    }),
  component: Audit,
})
function Audit() {
  const rows = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">
          Operations
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">Audit log</h1>
      </header>
      <form className="mb-5 flex flex-wrap gap-2" method="get">
        <input
          name="tenantId"
          defaultValue={search.tenantId}
          placeholder="Tenant ID"
          className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3"
        />
        <input
          name="action"
          defaultValue={search.action}
          placeholder="Action contains…"
          className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3"
        />
        <button className="rounded-xl bg-[var(--sea-ink)] px-5 font-semibold text-white">
          Filter
        </button>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Operator actions will appear here."
        />
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">
          {rows.map((row) => (
            <div key={row.id} className="p-5">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{row.action}</strong>
                <time className="text-sm text-[var(--sea-ink-soft)]">
                  {formatDate(row.createdAt)}
                </time>
              </div>
              <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
                {row.tenant.name} ·{' '}
                {row.actor?.name ?? row.actor?.email ?? 'System'}
              </p>
              <p className="mt-1 text-sm">
                {typeof row.metadata === 'object' &&
                row.metadata !== null &&
                'reason' in row.metadata
                  ? String(row.metadata.reason)
                  : 'No reason recorded'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
