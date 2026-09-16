import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import {
  CrudDialog,
  PermanentDeleteDialog,
} from '#/components/admin/crud-dialog'
import {
  archiveFlag,
  createFlag,
  permanentlyDeleteFlag,
  toggleTenantFlag,
  unarchiveFlag,
  updateFlag,
} from '#/lib/ops.functions'
import { EmptyState } from '#/components/admin/empty-state'
import { useServerFn } from '@tanstack/react-start'
import { flagsQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'

export const Route = createFileRoute('/_protected/flags')({
  loader: ({ context }) => context.queryClient.query(flagsQuery()),
  component: Flags,
})
function Flags() {
  const { LL } = useI18nContext()
  const [includeArchived, setIncludeArchived] = useState(false)
  const { data } = useSuspenseQuery(flagsQuery(includeArchived))
  const queryClient = useQueryClient()
  const toggle = useServerFn(toggleTenantFlag)
  const create = useServerFn(createFlag)
  const update = useServerFn(updateFlag)
  const archive = useServerFn(archiveFlag)
  const unarchive = useServerFn(unarchiveFlag)
  const [dialog, setDialog] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; flag: (typeof data.flags)[number] }
    | null
  >(null)
  const definitionMutation = useMutation({
    mutationFn: (value: { id?: string; key: string; description?: string }) =>
      value.id
        ? update({
            data: {
              id: value.id,
              key: value.key,
              description: value.description ?? null,
            },
          })
        : create({ data: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] })
      setDialog(null)
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] }),
  })
  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => unarchive({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] }),
  })
  const permanentlyDelete = useServerFn(permanentlyDeleteFlag)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => permanentlyDelete({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] })
      setDeleteId(null)
    },
  })
  const toggleMutation = useMutation({
    mutationFn: (input: {
      tenantId: string
      flagKey: string
      enabled: boolean
    }) => toggle({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] }),
  })
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.flags.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.flags.title()}
        </h1>
        <button
          type="button"
          onClick={() => setDialog({ mode: 'create' })}
          className="mt-4 rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white"
        >
          {LL.flags.create()}
        </button>
        <button
          type="button"
          onClick={() => setIncludeArchived((value) => !value)}
          className="mt-4 ms-2 rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
        >
          {includeArchived ? LL.crud.hideArchived() : LL.crud.showArchived()}
        </button>
      </header>
      {data.flags.length === 0 ? (
        <EmptyState
          title={LL.flags.noFlags()}
          description={LL.flags.noFlagsDescription()}
        />
      ) : (
        <div className="space-y-4">
          {data.flags.map((flag) => (
            <section
              key={flag.id}
              className="rounded-2xl border border-(--line) bg-(--surface) p-6"
            >
              <h2 className="font-serif text-2xl font-bold">{flag.key}</h2>
              <div className="mt-3 flex gap-2">
                {flag.archived ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void unarchiveMutation.mutateAsync(flag.id)
                      }
                      disabled={unarchiveMutation.isPending}
                      className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                    >
                      {LL.crud.restore()}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(flag.id)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      {LL.crud.deletePermanently()}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: 'edit', flag })}
                      className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                    >
                      {LL.flags.edit()}
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveMutation.mutateAsync(flag.id)}
                      disabled={archiveMutation.isPending}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      {LL.flags.archive()}
                    </button>
                  </>
                )}
              </div>
              <p className="mt-1 text-sm text-(--sea-ink-soft)">
                {flag.description ?? LL.flags.noDescription()}
              </p>
              {!flag.archived ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {data.tenants.map((tenant) => {
                    const override = flag.overrides.find(
                      (item) => item.tenantId === tenant.id,
                    )
                    const enabled = override?.enabled ?? false
                    return (
                      <label
                        key={tenant.id}
                        className="flex items-center justify-between rounded-xl bg-white/50 px-4 py-3 text-sm"
                      >
                        <span>{tenant.name}</span>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) => {
                            void toggleMutation.mutateAsync({
                              tenantId: tenant.id,
                              flagKey: flag.key,
                              enabled: event.target.checked,
                            })
                          }}
                          disabled={toggleMutation.isPending}
                        />
                      </label>
                    )
                  })}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
      {dialog ? (
        <CrudDialog
          title={dialog.mode === 'create' ? LL.flags.create() : LL.flags.edit()}
          error={definitionMutation.error ? LL.crud.saveError() : undefined}
          onClose={() => setDialog(null)}
        >
          <FlagForm
            initial={dialog.mode === 'edit' ? dialog.flag : undefined}
            isPending={definitionMutation.isPending}
            onSubmit={(value) => void definitionMutation.mutateAsync(value)}
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

function FlagForm({
  initial,
  isPending,
  onSubmit,
}: {
  initial?: {
    id: string
    key: string
    description: string | null
    archived?: boolean
  }
  isPending: boolean
  onSubmit: (value: { id?: string; key: string; description?: string }) => void
}) {
  const { LL } = useI18nContext()
  const form = useForm({
    defaultValues: {
      key: initial?.key ?? '',
      description: initial?.description ?? '',
    },
    onSubmit: ({ value }) => onSubmit({ ...value, id: initial?.id }),
  })
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="key">
        {(field) => (
          <label className="block text-sm font-semibold">
            {LL.flags.key()}
            <input
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
              required
            />
          </label>
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <label className="block text-sm font-semibold">
            {LL.flags.description()}
            <textarea
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
              rows={3}
            />
          </label>
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
