import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import {
  CrudDialog,
  PermanentDeleteDialog,
} from '#/components/admin/crud-dialog'
import { EmptyState } from '#/components/admin/empty-state'
import {
  archivePlan,
  createPlan,
  permanentlyDeletePlan,
  unarchivePlan,
  updatePlan,
} from '#/lib/ops.functions'
import { plansQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'

export const Route = createFileRoute('/_protected/plans')({
  loader: ({ context }) => context.queryClient.query(plansQuery()),
  component: Plans,
})

type PlanFormValue = {
  name: string
  slug: string
  priceCents: number
  currency: string
  interval: string
  trialDays: number
  stripePriceId: string
}

function Plans() {
  const { LL } = useI18nContext()
  const [includeArchived, setIncludeArchived] = useState(false)
  const { data: plans } = useSuspenseQuery(plansQuery(includeArchived))
  const queryClient = useQueryClient()
  const create = useServerFn(createPlan)
  const update = useServerFn(updatePlan)
  const archive = useServerFn(archivePlan)
  const restore = useServerFn(unarchivePlan)
  const permanentlyDelete = useServerFn(permanentlyDeletePlan)
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; plan: (typeof plans)[number] } | null
  >(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (value: PlanFormValue & { id?: string }) =>
      value.id
        ? update({
            data: { ...value, stripePriceId: value.stripePriceId || null },
          })
        : create({
            data: { ...value, stripePriceId: value.stripePriceId || null },
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setDialog(null)
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  })
  const restoreMutation = useMutation({
    mutationFn: (id: string) => restore({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => permanentlyDelete({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setDeleteId(null)
    },
  })

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.plans.kicker()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">
          {LL.plans.title()}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDialog({ mode: 'create' })}
            className="rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white"
          >
            {LL.plans.create()}
          </button>
          <button
            type="button"
            onClick={() => setIncludeArchived((value) => !value)}
            className="rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
          >
            {includeArchived ? LL.crud.hideArchived() : LL.crud.showArchived()}
          </button>
        </div>
      </header>
      {plans.length === 0 ? (
        <EmptyState
          title={LL.plans.noPlans()}
          description={LL.plans.noPlansDescription()}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="rounded-2xl border border-(--line) bg-(--surface) p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl font-bold">{plan.name}</h2>
                  <p className="text-sm text-(--sea-ink-soft)">{plan.slug}</p>
                </div>
                {plan.deletedAt ? (
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {LL.crud.archived()}
                  </span>
                ) : plan.subscriptionCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {LL.plans.inUse()}
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-(--sea-ink-soft)">
                {plan.priceCents} {plan.currency} · {plan.interval} ·{' '}
                {plan.trialDays} {LL.plans.trialDays()}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {plan.deletedAt ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void restoreMutation.mutateAsync(plan.id)}
                      disabled={restoreMutation.isPending}
                      className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                    >
                      {LL.crud.restore()}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(plan.id)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                        plan.subscriptionCount > 0
                          ? 'cursor-not-allowed border-(--line) text-(--sea-ink-soft) opacity-45'
                          : 'border-red-200 text-red-700'
                      }`}
                    >
                      {LL.crud.deletePermanently()}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: 'edit', plan })}
                      className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                    >
                      {LL.plans.edit()}
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveMutation.mutateAsync(plan.id)}
                      disabled={
                        archiveMutation.isPending || plan.subscriptionCount > 0
                      }
                      title={
                        plan.subscriptionCount > 0
                          ? LL.plans.inUse()
                          : undefined
                      }
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      {LL.plans.archive()}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {dialog ? (
        <CrudDialog
          title={dialog.mode === 'create' ? LL.plans.create() : LL.plans.edit()}
          error={
            mutation.error instanceof Error ? mutation.error.message : undefined
          }
          onClose={() => setDialog(null)}
        >
          <PlanForm
            initial={dialog.mode === 'edit' ? dialog.plan : undefined}
            isPending={mutation.isPending}
            onSubmit={(value) => void mutation.mutateAsync(value)}
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

function PlanForm({
  initial,
  isPending,
  onSubmit,
}: {
  initial?: {
    id?: string
    name: string
    slug: string
    priceCents: number
    currency: string
    interval: string
    trialDays: number
    stripePriceId: string | null
  }
  isPending: boolean
  onSubmit: (value: PlanFormValue & { id?: string }) => void
}) {
  const { LL } = useI18nContext()
  const form = useForm({
    defaultValues: {
      id: undefined as string | undefined,
      name: initial?.name ?? '',
      slug: initial?.slug ?? '',
      priceCents: initial?.priceCents ?? 0,
      currency: initial?.currency ?? 'USD',
      interval: initial?.interval ?? 'month',
      trialDays: initial?.trialDays ?? 0,
      stripePriceId: initial?.stripePriceId ?? '',
    },
    onSubmit: ({ value }) => onSubmit({ ...value, id: initial?.id }),
  })
  const fields = [
    ['name', LL.crud.name(), 'text'],
    ['slug', LL.crud.slug(), 'text'],
    ['priceCents', LL.plans.price(), 'number'],
    ['currency', LL.plans.currency(), 'text'],
    ['interval', LL.plans.interval(), 'text'],
    ['trialDays', LL.plans.trialDays(), 'number'],
    ['stripePriceId', LL.plans.stripePriceId(), 'text'],
  ] as const
  return (
    <form
      className="mt-5 grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {fields.map(([name, label, type]) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label className="block text-sm font-semibold">
              {label}
              <input
                type={type}
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(
                    type === 'number'
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
                className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                required={name !== 'stripePriceId'}
              />
            </label>
          )}
        </form.Field>
      ))}
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting || isPending}
            className="sm:col-span-2 rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {LL.crud.save()}
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}
