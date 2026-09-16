import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { EmptyState } from '#/components/admin/empty-state'
import { StatusBadge } from '#/components/admin/status-badge'
import { tenantsQuery } from '#/lib/queries'

export const Route = createFileRoute('/_protected/tenants/')({
  validateSearch: (search: Record<string, unknown>) => ({
    search: typeof search.search === 'string' ? search.search : '',
  }),
  loaderDeps: ({ search }) => ({ search: search.search }),
  loader: ({ context, deps }) =>
    context.queryClient.query(tenantsQuery(deps.search)),
  pendingComponent: Loading,
  errorComponent: ({ error }) => (
    <EmptyState title="Unable to load tenants" description={String(error)} />
  ),
  component: Tenants,
})

function Tenants() {
  const { data } = useSuspenseQuery(tenantsQuery(Route.useSearch().search))
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const form = useForm({
    defaultValues: { search: search.search },
    onSubmit: ({ value }) =>
      navigate({ search: (previous) => ({ ...previous, search: value.search }) }),
  })
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">
          Accounts
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">Tenants</h1>
      </header>
      <form className="mb-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
        <form.Field name="search">
          {(field) => <input
          name={field.name}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
          placeholder="Search name or owner email"
          className="w-full max-w-md rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--lagoon)]"
        />}
        </form.Field>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit, isSubmitting]) => <button
          className="rounded-xl bg-[var(--sea-ink)] px-5 font-semibold text-white"
          type="submit"
          disabled={!canSubmit || isSubmitting}
        >
          Search
          </button>}
        </form.Subscribe>
      </form>
      {data.length === 0 ? (
        <EmptyState
          title="No tenants found"
          description="Try another search or add a tenant in a later operations phase."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="divide-y divide-[var(--line)]">
            {data.map((tenant) => (
              <Link
                to="/tenants/$id"
                params={{ id: tenant.id }}
                key={tenant.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-white/60"
              >
                <div>
                  <p className="font-semibold">{tenant.name}</p>
                  <p className="text-sm text-[var(--sea-ink-soft)]">
                    {tenant.ownerEmail ?? tenant.slug}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--sea-ink-soft)]">
                    {tenant.plan ?? 'No plan'}
                  </span>
                  <StatusBadge status={tenant.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
function Loading() {
  return (
    <div className="animate-pulse text-[var(--sea-ink-soft)]">
      Loading tenants…
    </div>
  )
}
