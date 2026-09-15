import { createFileRoute } from '@tanstack/react-router'
import { getTenants } from '#/lib/admin.functions'
import { EmptyState } from '#/components/admin/empty-state'
import { StatusBadge } from '#/components/admin/status-badge'

export const Route = createFileRoute('/_protected/tenants/')({
  validateSearch: (search: Record<string, unknown>) => ({ search: typeof search.search === 'string' ? search.search : '' }),
  loaderDeps: ({ search }) => ({ search: search.search }),
  loader: ({ deps }) => getTenants({ data: { search: deps.search || undefined } }),
  pendingComponent: Loading,
  errorComponent: ({ error }) => <EmptyState title="Unable to load tenants" description={String(error)} />,
  component: Tenants,
})

function Tenants() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return <div className="mx-auto max-w-6xl"><header className="mb-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">Accounts</p><h1 className="mt-2 font-serif text-4xl font-bold">Tenants</h1></header><form className="mb-5 flex gap-2" method="get"><input name="search" defaultValue={search.search} placeholder="Search name or owner email" className="w-full max-w-md rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--lagoon)]" /><button className="rounded-xl bg-[var(--sea-ink)] px-5 font-semibold text-white" type="submit">Search</button></form>{data.length === 0 ? <EmptyState title="No tenants found" description="Try another search or add a tenant in a later operations phase." /> : <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="divide-y divide-[var(--line)]">{data.map((tenant) => <a href={`/tenants/${tenant.id}`} key={tenant.id} className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-white/60"><div><p className="font-semibold">{tenant.name}</p><p className="text-sm text-[var(--sea-ink-soft)]">{tenant.ownerEmail ?? tenant.slug}</p></div><div className="flex items-center gap-3"><span className="text-sm text-[var(--sea-ink-soft)]">{tenant.plan ?? 'No plan'}</span><StatusBadge status={tenant.status} /></div></a>)}</div></div>}</div>
}
function Loading() { return <div className="animate-pulse text-[var(--sea-ink-soft)]">Loading tenants…</div> }
