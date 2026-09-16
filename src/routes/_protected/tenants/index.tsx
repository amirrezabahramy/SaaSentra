import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { EmptyState } from '#/components/admin/empty-state'
import { CrudDialog } from '#/components/admin/crud-dialog'
import { StatusBadge } from '#/components/admin/status-badge'
import { tenantsQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'
import { createTenant, unarchiveTenant } from '#/lib/ops.functions'

export const Route = createFileRoute('/_protected/tenants/')({
  validateSearch: (search: Record<string, unknown>) => ({
    search: typeof search.search === 'string' ? search.search : '',
  }),
  loaderDeps: ({ search }) => ({ search: search.search }),
  loader: ({ context, deps }) =>
    context.queryClient.query(tenantsQuery(deps.search)),
  pendingComponent: Loading,
  errorComponent: ({ error }) => <TenantsErrorState message={String(error)} />,
  component: Tenants,
})

function Tenants() {
  const { LL } = useI18nContext()
  const [includeArchived, setIncludeArchived] = useState(false)
  const { data } = useSuspenseQuery(
    tenantsQuery(Route.useSearch().search, includeArchived),
  )
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const create = useServerFn(createTenant)
  const [showCreate, setShowCreate] = useState(false)
  const createMutation = useMutation({
    mutationFn: (value: { name: string; slug: string }) =>
      create({ data: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      setShowCreate(false)
    },
  })
  const unarchive = useServerFn(unarchiveTenant)
  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => unarchive({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  })
  const form = useForm({
    defaultValues: { search: search.search },
    onSubmit: ({ value }) =>
      navigate({
        search: (previous) => ({ ...previous, search: value.search }),
      }),
  })
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.tenants.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.tenants.title()}
        </h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="mt-4 rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white"
        >
          {LL.tenants.create()}
        </button>
        <button
          type="button"
          onClick={() => setIncludeArchived((value) => !value)}
          className="mt-4 ms-2 rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
        >
          {includeArchived ? LL.crud.hideArchived() : LL.crud.showArchived()}
        </button>
      </header>
      <form
        className="mb-5 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="search">
          {(field) => (
            <input
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder={LL.tenants.searchPlaceholder()}
              className="w-full max-w-md rounded-xl border border-(--line) bg-white/70 px-4 py-3 outline-none focus:ring-2 focus:ring-(--lagoon)"
            />
          )}
        </form.Field>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <button
              className="rounded-xl bg-(--sea-ink) px-5 font-semibold text-white"
              type="submit"
              disabled={!canSubmit || isSubmitting}
            >
              {LL.tenants.search()}
            </button>
          )}
        </form.Subscribe>
      </form>
      {data.length === 0 ? (
        <EmptyState
          title={LL.tenants.noTenants()}
          description={LL.tenants.noTenantsDescription()}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-(--line) bg-(--surface)">
          <div className="divide-y divide-(--line)">
            {data.map((tenant) => {
              const content = (
                <div>
                  <p className="font-semibold">
                    {tenant.name}{' '}
                    {tenant.archived ? (
                      <span className="text-xs text-(--sea-ink-soft)">
                        ({LL.crud.archived()})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-(--sea-ink-soft)">
                    {tenant.ownerEmail || tenant.slug}
                  </p>
                </div>
              )
              const actions = (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-(--sea-ink-soft)">
                    {tenant.plan ?? LL.tenants.noPlan()}
                  </span>
                  <StatusBadge status={tenant.status} />
                  {tenant.archived ? (
                    <button
                      type="button"
                      onClick={() =>
                        void unarchiveMutation.mutateAsync(tenant.id)
                      }
                      disabled={unarchiveMutation.isPending}
                      className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                    >
                      {LL.crud.restore()}
                    </button>
                  ) : null}
                </div>
              )
              return tenant.archived ? (
                <div
                  key={tenant.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  {content}
                  {actions}
                </div>
              ) : (
                <Link
                  to="/tenants/$id"
                  params={{ id: tenant.id }}
                  key={tenant.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-white/60"
                >
                  {content}
                  {actions}
                </Link>
              )
            })}
          </div>
        </div>
      )}
      {showCreate ? (
        <CrudDialog
          title={LL.tenants.create()}
          error={createMutation.error ? LL.crud.saveError() : undefined}
          onClose={() => setShowCreate(false)}
        >
          <TenantForm
            submitLabel={LL.crud.create()}
            isPending={createMutation.isPending}
            onSubmit={(value) => void createMutation.mutateAsync(value)}
          />
        </CrudDialog>
      ) : null}
    </div>
  )
}

function TenantForm({
  submitLabel,
  isPending,
  onSubmit,
}: {
  submitLabel: string
  isPending: boolean
  onSubmit: (value: { name: string; slug: string }) => void
}) {
  const form = useForm({
    defaultValues: { name: '', slug: '' },
    onSubmit: ({ value }) => onSubmit(value),
  })
  const { LL } = useI18nContext()
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <label className="block text-sm font-semibold">
            {LL.crud.name()}
            <input
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
              required
            />
          </label>
        )}
      </form.Field>
      <form.Field name="slug">
        {(field) => (
          <label className="block text-sm font-semibold">
            {LL.crud.slug()}
            <input
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
              required
            />
          </label>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting || isPending}
            className="rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitLabel}
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}
function Loading() {
  const { LL } = useI18nContext()
  return (
    <div className="animate-pulse text-(--sea-ink-soft)">
      {LL.tenants.loading()}
    </div>
  )
}

function TenantsErrorState({ message }: { message: string }) {
  const { LL } = useI18nContext()
  return <EmptyState title={LL.tenants.unableToLoad()} description={message} />
}
