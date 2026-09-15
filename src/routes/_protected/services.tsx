import { createFileRoute } from '@tanstack/react-router'
import { getServices } from '#/lib/ops.functions'
import { EmptyState } from '#/components/admin/empty-state'

export const Route = createFileRoute('/_protected/services')({
  loader: () => getServices(),
  component: Services,
})
function Services() {
  const rows = Route.useLoaderData()
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">
          Integrations
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">Services</h1>
      </header>
      {rows.length === 0 ? (
        <EmptyState
          title="No services"
          description="Controlled services will appear here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"
            >
              <div className="flex justify-between gap-3">
                <h2 className="font-serif text-2xl font-bold">{row.name}</h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {row.deployStatus}
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
                {row.tenantName} · {row.controlType}
              </p>
              <div className="mt-5 rounded-xl bg-white/50 p-4 text-sm">
                <p className="font-semibold">
                  Entitlement: {row.entitlement.active ? 'Active' : 'Inactive'}
                </p>
                <p className="mt-1 text-[var(--sea-ink-soft)]">
                  Plan: {row.entitlement.plan ?? 'None'} ·{' '}
                  {Object.keys(row.entitlement.flags).length} flags
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
