import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { EmptyState } from '#/components/admin/empty-state'
import { formatDate } from '#/lib/format'
import { auditQuery } from '#/lib/queries'

export const Route = createFileRoute('/_protected/audit')({
  validateSearch: (search: Record<string, unknown>) => ({
    tenantId: typeof search.tenantId === 'string' ? search.tenantId : '',
    action: typeof search.action === 'string' ? search.action : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.query(auditQuery(deps.tenantId, deps.action)),
  component: Audit,
})
function Audit() {
  const search = Route.useSearch()
  const { data: rows } = useSuspenseQuery(
    auditQuery(search.tenantId, search.action),
  )
  const navigate = Route.useNavigate()
  const form = useForm({
    defaultValues: { tenantId: search.tenantId, action: search.action },
    onSubmit: ({ value }) =>
      navigate({ search: (previous) => ({ ...previous, ...value }) }),
  })
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          Operations
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">Audit log</h1>
      </header>
      <form
        className="mb-5 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="tenantId">
          {(field) => (
            <input
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Tenant ID"
              className="rounded-xl border border-(--line) bg-white/70 px-4 py-3"
            />
          )}
        </form.Field>
        <form.Field name="action">
          {(field) => (
            <input
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Action contains…"
              className="rounded-xl border border-(--line) bg-white/70 px-4 py-3"
            />
          )}
        </form.Field>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <button
              disabled={!canSubmit || isSubmitting}
              className="rounded-xl bg-(--sea-ink) px-5 font-semibold text-white"
            >
              Filter
            </button>
          )}
        </form.Subscribe>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Operator actions will appear here."
        />
      ) : (
        <div className="rounded-2xl border border-(--line) bg-(--surface) divide-y divide-(--line)">
          {rows.map((row) => (
            <div key={row.id} className="p-5">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{row.action}</strong>
                <time className="text-sm text-(--sea-ink-soft)">
                  {formatDate(row.createdAt)}
                </time>
              </div>
              <p className="mt-1 text-sm text-(--sea-ink-soft)">
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
