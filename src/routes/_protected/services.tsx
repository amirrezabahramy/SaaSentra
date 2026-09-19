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
import { CopyableValue } from '#/components/admin/copyable-value'
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
import { servicesQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'

export const Route = createFileRoute('/_protected/services')({
  loader: ({ context }) => context.queryClient.query(servicesQuery()),
  component: Services,
})
function Services() {
  const { LL } = useI18nContext()
  const [includeArchived, setIncludeArchived] = useState(false)
  const { data: rows } = useSuspenseQuery(servicesQuery(includeArchived))
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
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-(--sea-ink-soft)">
                  {LL.services.serviceId()}
                </p>
                <CopyableValue
                  value={row.id}
                  label={LL.services.copyServiceId()}
                  copiedLabel={LL.crud.copied()}
                />
              </div>
              <div className="mt-5 rounded-xl bg-white/50 p-4 text-sm">
                <p className="font-semibold">
                  {LL.services.flags()}: {row.flags.length}
                </p>
                <p className="mt-1 text-(--sea-ink-soft)">
                  {row.flags.map((flag) => flag.key).join(', ') ||
                    LL.services.none()}
                </p>
                <p className="mt-1 text-(--sea-ink-soft)">
                  {LL.crud.tenant()}: {row.assignments.length}
                </p>
              </div>
              <div className="mt-3 rounded-xl border border-(--line) bg-white/40 p-4 text-sm">
                <p className="font-semibold">{LL.services.paymentDelivery()}</p>
                {row.paymentDelivery ? (
                  <>
                    <p
                      className={`mt-1 font-semibold ${
                        row.paymentDelivery.status === 'SUCCEEDED'
                          ? 'text-emerald-700'
                          : row.paymentDelivery.status === 'FAILED'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {row.paymentDelivery.status}
                    </p>
                    <p className="mt-1 text-(--sea-ink-soft)">
                      {LL.services.deliveryAttempts()}:{' '}
                      {row.paymentDelivery.attempts}
                    </p>
                    {row.paymentDelivery.lastError ? (
                      <p className="mt-1 break-words text-xs text-red-700">
                        {row.paymentDelivery.lastError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-(--sea-ink-soft)">
                    {LL.services.noPaymentDelivery()}
                  </p>
                )}
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
  name: string
  flags: Array<{ key: string; description: string | null }>
}

function ServiceForm({
  initial,
  isPending,
  onSubmit,
}: {
  initial?: Partial<ServiceFormValue> & {
    id?: string
    flags?: Array<{ key: string; description: string | null }>
  }
  isPending: boolean
  onSubmit: (value: ServiceFormValue) => void
}) {
  const { LL } = useI18nContext()
  const form = useForm({
    defaultValues: {
      name: initial?.name ?? '',
      flags: initial?.flags ?? [],
    },
    onSubmit: ({ value }) => onSubmit(value),
  })
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {([['name', LL.crud.name()]] as const).map(([name, label]) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label className="block text-sm font-semibold">
              {label}
              <input
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
              />
            </label>
          )}
        </form.Field>
      ))}
      <form.Field name="flags">
        {(field) => (
          <div className="space-y-3 rounded-xl border border-(--line) p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">
                {LL.services.flags()}
              </span>
              <button
                type="button"
                onClick={() => field.pushValue({ key: '', description: null })}
                className="rounded-lg border border-(--line) px-3 py-2 text-xs font-semibold"
              >
                {LL.flags.create()}
              </button>
            </div>
            {field.state.value.map((flag, index) => (
              <div key={`service-flag-${index}`} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={flag.key}
                    onChange={(event) =>
                      form.setFieldValue(
                        `flags[${index}].key`,
                        event.target.value,
                      )
                    }
                    placeholder={LL.flags.key()}
                    className="min-w-0 flex-1 rounded-xl border border-(--line) bg-white/70 px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => field.removeValue(index)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                  >
                    {LL.crud.deletePermanently()}
                  </button>
                </div>
                <input
                  value={flag.description ?? ''}
                  onChange={(event) =>
                    form.setFieldValue(
                      `flags[${index}].description`,
                      event.target.value || null,
                    )
                  }
                  placeholder={LL.flags.description()}
                  className="w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3 text-sm"
                />
              </div>
            ))}
          </div>
        )}
      </form.Field>
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
