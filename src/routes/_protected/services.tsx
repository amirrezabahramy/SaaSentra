import { createFileRoute } from '@tanstack/react-router'
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { EmptyState } from '#/components/admin/empty-state'
import {
  CrudDialog,
  PermanentDeleteDialog,
} from '#/components/admin/crud-dialog'
import {
  archiveService,
  createService,
  permanentlyDeleteService,
  unarchiveService,
  updateService,
} from '#/lib/ops.functions'
import { servicesQuery, tenantsQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'

export const Route = createFileRoute('/_protected/services')({
  loader: ({ context }) => context.queryClient.query(servicesQuery()),
  component: Services,
})
function Services() {
  const { LL } = useI18nContext()
  const [includeArchived, setIncludeArchived] = useState(false)
  const { data: rows } = useSuspenseQuery(servicesQuery(includeArchived))
  const { data: tenants } = useSuspenseQuery(tenantsQuery())
  const queryClient = useQueryClient()
  const create = useServerFn(createService)
  const update = useServerFn(updateService)
  const archive = useServerFn(archiveService)
  const unarchive = useServerFn(unarchiveService)
  const [editing, setEditing] = useState<(typeof rows)[number] | null>(null)
  const [creating, setCreating] = useState(false)
  const createMutation = useMutation({
    mutationFn: (data: ServiceFormValue) => create({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'services'] })
      setCreating(false)
    },
  })
  const updateMutation = useMutation({
    mutationFn: (data: ServiceFormValue & { id: string }) => update({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'services'] })
      setEditing(null)
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      archive({ data: { id, reason: 'Archived by operator' } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] }),
  })
  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => unarchive({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] }),
  })
  const permanentlyDelete = useServerFn(permanentlyDeleteService)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => permanentlyDelete({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'services'] })
      setDeleteId(null)
    },
  })
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.services.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.services.title()}
        </h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-4 rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white"
        >
          {LL.services.create()}
        </button>
        <button
          type="button"
          onClick={() => setIncludeArchived((value) => !value)}
          className="mt-4 ms-2 rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
        >
          {includeArchived ? LL.crud.hideArchived() : LL.crud.showArchived()}
        </button>
      </header>
      {rows.length === 0 ? (
        <EmptyState
          title={LL.services.noServices()}
          description={LL.services.noServicesDescription()}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-(--line) bg-(--surface) p-6"
            >
              <div className="flex justify-between gap-3">
                <h2 className="font-serif text-2xl font-bold">{row.name}</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    row.deployStatus === 'HEALTHY'
                      ? 'bg-emerald-100 text-emerald-800'
                      : row.deployStatus === 'DEGRADED'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  {row.deployStatus}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                {row.archived ? (
                  <>
                    <button
                      type="button"
                      disabled={unarchiveMutation.isPending}
                      onClick={() => void unarchiveMutation.mutateAsync(row.id)}
                      className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                    >
                      {LL.crud.restore()}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(row.id)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      {LL.crud.deletePermanently()}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(row)}
                      className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                    >
                      {LL.services.edit()}
                    </button>
                    <button
                      type="button"
                      disabled={archiveMutation.isPending}
                      onClick={() => void archiveMutation.mutateAsync(row.id)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
                    >
                      {LL.services.archive()}
                    </button>
                  </>
                )}
              </div>
              <p className="mt-2 text-sm text-(--sea-ink-soft)">
                {row.tenantName} · {row.controlType}
              </p>
              <div className="mt-5 rounded-xl bg-white/50 p-4 text-sm">
                <p className="font-semibold">
                  {LL.services.entitlement()}:{' '}
                  {row.entitlement.active
                    ? LL.services.active()
                    : LL.services.inactive()}
                </p>
                <p className="mt-1 text-(--sea-ink-soft)">
                  {LL.services.plan()}:{' '}
                  {row.entitlement.plan ?? LL.services.none()} ·{' '}
                  {Object.keys(row.entitlement.flags).length}{' '}
                  {LL.services.flags()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {creating || editing ? (
        <CrudDialog
          title={creating ? LL.services.create() : LL.services.edit()}
          error={
            createMutation.error || updateMutation.error
              ? LL.crud.saveError()
              : undefined
          }
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        >
          <ServiceForm
            tenants={tenants}
            initial={editing ?? undefined}
            isPending={createMutation.isPending || updateMutation.isPending}
            onSubmit={(value) => {
              if (editing) {
                void updateMutation.mutateAsync({ ...value, id: editing.id })
              } else {
                void createMutation.mutateAsync(value)
              }
            }}
          />
        </CrudDialog>
      ) : null}
      {deleteId ? (
        <PermanentDeleteDialog
          title={LL.crud.deletePermanently()}
          isPending={deleteMutation.isPending}
          onClose={() => setDeleteId(null)}
          onConfirm={() => void deleteMutation.mutateAsync(deleteId)}
        />
      ) : null}
    </div>
  )
}

type ServiceFormValue = {
  tenantId: string
  name: string
  controlType: 'ENTITLEMENT' | 'TOKEN' | 'WEBHOOK' | 'INFRA'
  endpointUrl?: string | null
  deployStatus: 'HEALTHY' | 'DEGRADED' | 'OFFLINE'
  paymentCallbackUrl?: string | null
  paymentCallbackSecret?: string | null
}

function ServiceForm({
  tenants,
  initial,
  isPending,
  onSubmit,
}: {
  tenants: Array<{ id: string; name: string }>
  initial?: Partial<ServiceFormValue> & { id?: string }
  isPending: boolean
  onSubmit: (value: ServiceFormValue) => void
}) {
  const { LL } = useI18nContext()
  const form = useForm({
    defaultValues: {
      tenantId: initial?.tenantId || tenants[0]?.id || '',
      name: initial?.name ?? '',
      controlType: initial?.controlType ?? 'ENTITLEMENT',
      endpointUrl: initial?.endpointUrl ?? '',
      deployStatus: initial?.deployStatus ?? 'HEALTHY',
      paymentCallbackUrl: initial?.paymentCallbackUrl ?? '',
      paymentCallbackSecret: '',
    },
    onSubmit: ({ value }) =>
      onSubmit({
        ...value,
        endpointUrl: value.endpointUrl.trim() || null,
        paymentCallbackUrl: value.paymentCallbackUrl.trim() || null,
        paymentCallbackSecret: value.paymentCallbackSecret.trim() || null,
      }),
  })
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {(
        [
          ['tenantId', LL.crud.tenant(), 'select'],
          ['name', LL.crud.name(), 'input'],
          ['controlType', LL.crud.controlType(), 'select'],
          ['endpointUrl', LL.crud.endpointUrl(), 'input'],
          ['deployStatus', LL.crud.deployStatus(), 'select'],
          ['paymentCallbackUrl', LL.services.paymentCallbackUrl(), 'input'],
          [
            'paymentCallbackSecret',
            LL.services.paymentCallbackSecret(),
            'input',
          ],
        ] as const
      ).map(([name, label, kind]) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label className="block text-sm font-semibold">
              {label}
              {kind === 'select' ? (
                <select
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                >
                  {(name === 'tenantId'
                    ? tenants
                    : name === 'controlType'
                      ? ['ENTITLEMENT', 'TOKEN', 'WEBHOOK', 'INFRA']
                      : ['HEALTHY', 'DEGRADED', 'OFFLINE']
                  ).map((option) => {
                    const value =
                      typeof option === 'string' ? option : option.id
                    const text =
                      typeof option === 'string' ? option : option.name
                    return (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <input
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                />
              )}
            </label>
          )}
        </form.Field>
      ))}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {LL.crud.save()}
      </button>
    </form>
  )
}
