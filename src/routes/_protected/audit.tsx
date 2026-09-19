import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { EmptyState } from '#/components/admin/empty-state'
import { formatDate } from '#/lib/format'
import { auditQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'

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
  const { LL } = useI18nContext()
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
          {LL.audit.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.audit.title()}
        </h1>
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
              placeholder={LL.audit.tenantId()}
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
              placeholder={LL.audit.actionPlaceholder()}
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
              {LL.audit.filter()}
            </button>
          )}
        </form.Subscribe>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title={LL.audit.noEntries()}
          description={LL.audit.noEntriesDescription()}
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
                {row.tenant?.name ?? LL.audit.system()} ·{' '}
                {row.actor?.name ?? row.actor?.email ?? LL.audit.system()}
              </p>
              <p className="mt-1 text-sm">
                {typeof row.metadata === 'object' &&
                row.metadata !== null &&
                'reason' in row.metadata
                  ? String(row.metadata.reason)
                  : LL.audit.noReason()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
