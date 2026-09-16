import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { CrudDialog } from '#/components/admin/crud-dialog'
import { StatusBadge } from '#/components/admin/status-badge'
import { EmptyState } from '#/components/admin/empty-state'
import { formatCurrency, formatDate } from '#/lib/format'
import { subscriptionsQuery, plansQuery, tenantsQuery } from '#/lib/queries'
import {
  archiveSubscription,
  createSubscription,
  unarchiveSubscription,
  updateSubscription,
} from '#/lib/ops.functions'
import { useI18nContext } from '#/i18n/i18n-react'

export const Route = createFileRoute('/_protected/subscriptions')({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search.status === 'string' ? search.status : '',
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) =>
    context.queryClient.query(subscriptionsQuery(deps.status)),
  component: Subscriptions,
})

const statuses = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'DISABLED',
  'CANCELED',
  'DISABLED_AT_PERIOD_END',
  'ARCHIVED',
] as const
function Subscriptions() {
  const { LL } = useI18nContext()
  const search = Route.useSearch()
  const { data: rows } = useSuspenseQuery(
    subscriptionsQuery(search.status, search.status === 'ARCHIVED'),
  )
  const { data: plans } = useSuspenseQuery(plansQuery())
  const { data: tenants } = useSuspenseQuery(tenantsQuery())
  const queryClient = useQueryClient()
  const create = useServerFn(createSubscription)
  const update = useServerFn(updateSubscription)
  const archive = useServerFn(archiveSubscription)
  const unarchive = useServerFn(unarchiveSubscription)
  const [dialog, setDialog] = useState<(typeof rows)[number] | 'create' | null>(
    null,
  )
  const mutation = useMutation({
    mutationFn: (value: SubscriptionFormValue) =>
      value.id
        ? update({
            data: {
              ...value,
              periodEnd: new Date(value.periodEnd),
              reason:
                value.reason?.trim() ||
                'Subscription details updated by operator',
            },
          })
        : create({
            data: {
              tenantId: value.tenantId,
              planId: value.planId,
              periodEnd: new Date(value.periodEnd),
            },
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'subscriptions'],
      })
      setDialog(null)
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      archive({ data: { id, reason: 'Archived by operator' } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  })
  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => unarchive({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  })
  const navigate = Route.useNavigate()
  const form = useForm({
    defaultValues: { status: search.status },
    onSubmit: ({ value }) =>
      navigate({
        search: (previous) => ({ ...previous, status: value.status }),
      }),
  })
  return (
    <Page title={LL.subscriptions.title()} kicker={LL.subscriptions.kicker()}>
      <form
        className="mb-5 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="status">
          {(field) => (
            <select
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              className="rounded-xl border border-(--line) bg-white/70 px-4 py-3"
            >
              <option value="">{LL.subscriptions.allStatuses()}</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
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
              {LL.subscriptions.filter()}
            </button>
          )}
        </form.Subscribe>
      </form>
      <button
        type="button"
        onClick={() => setDialog('create')}
        className="mb-5 rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white"
      >
        {LL.subscriptions.create()}
      </button>
      {rows.length === 0 ? (
        <EmptyState
          title={LL.subscriptions.noSubscriptions()}
          description={LL.subscriptions.noSubscriptionsDescription()}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-(--line) bg-(--surface) divide-y divide-(--line)">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap justify-between gap-3 p-5 hover:bg-white/60"
            >
              <div>
                <Link
                  to="/tenants/$id"
                  params={{ id: row.tenantId }}
                  className="font-semibold hover:underline"
                >
                  {row.tenant.name}
                </Link>
                <p className="text-sm text-(--sea-ink-soft)">
                  {row.plan.name} · {LL.subscriptions.ends()}{' '}
                  {formatDate(row.currentPeriodEnd)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span>{formatCurrency(row.plan.priceCents)}</span>
                <StatusBadge status={row.status} />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDialog(row)}
                  className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                >
                  {LL.subscriptions.edit()}
                </button>
                {row.status === 'ARCHIVED' ? (
                  <button
                    type="button"
                    onClick={() => void unarchiveMutation.mutateAsync(row.id)}
                    disabled={unarchiveMutation.isPending}
                    className="rounded-lg border border-(--line) px-3 py-2 text-sm font-semibold"
                  >
                    {LL.crud.restore()}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void archiveMutation.mutateAsync(row.id)}
                    disabled={
                      archiveMutation.isPending || row.status !== 'DISABLED'
                    }
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
                  >
                    {LL.subscriptions.archive()}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog ? (
        <CrudDialog
          title={
            dialog === 'create'
              ? LL.subscriptions.create()
              : LL.subscriptions.edit()
          }
          error={
            mutation.error instanceof Error ? mutation.error.message : undefined
          }
          onClose={() => setDialog(null)}
        >
          <SubscriptionForm
            tenants={tenants}
            plans={plans}
            initial={
              dialog === 'create'
                ? undefined
                : {
                    id: dialog.id,
                    tenantId: dialog.tenantId,
                    planName: dialog.plan.name,
                    currentPeriodEnd: dialog.currentPeriodEnd.toISOString(),
                    status: dialog.status,
                  }
            }
            isPending={mutation.isPending}
            onSubmit={(value) => void mutation.mutateAsync(value)}
          />
        </CrudDialog>
      ) : null}
    </Page>
  )
}

type SubscriptionFormValue = {
  id?: string
  tenantId: string
  planId: string
  periodEnd: string
  status?: (typeof statuses)[number]
  reason?: string
}

const allowedStatusChanges: Record<
  (typeof statuses)[number],
  readonly (typeof statuses)[number][]
> = {
  TRIALING: ['ACTIVE', 'PAST_DUE', 'CANCELED'],
  ACTIVE: ['PAST_DUE', 'CANCELED'],
  PAST_DUE: ['GRACE_PERIOD', 'ACTIVE'],
  GRACE_PERIOD: ['DISABLED', 'ACTIVE'],
  DISABLED: ['ACTIVE', 'ARCHIVED'],
  CANCELED: ['DISABLED_AT_PERIOD_END'],
  DISABLED_AT_PERIOD_END: ['DISABLED'],
  ARCHIVED: [],
}

function SubscriptionForm({
  tenants,
  plans,
  initial,
  isPending,
  onSubmit,
}: {
  tenants: Array<{ id: string; name: string; subscriptionId: string | null }>
  plans: Array<{ id: string; name: string }>
  initial?: {
    id: string
    tenantId: string
    planName: string
    currentPeriodEnd: string
    status: (typeof statuses)[number] | 'TRIALING'
  }
  isPending: boolean
  onSubmit: (value: SubscriptionFormValue) => void
}) {
  const { LL } = useI18nContext()
  const form = useForm({
    defaultValues: {
      id: initial?.id,
      tenantId: initial?.tenantId || tenants[0]?.id || '',
      planId:
        plans.find((plan) => plan.name === initial?.planName)?.id ||
        plans[0]?.id ||
        '',
      periodEnd: initial?.currentPeriodEnd.slice(0, 10) || '',
      status: initial?.status,
      reason: '',
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
      {(
        [
          ['tenantId', LL.crud.tenant(), tenants],
          ['planId', LL.crud.plan(), plans],
        ] as const
      ).map(([name, label, options]) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label className="block text-sm font-semibold">
              {label}
              <select
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
      ))}
      {initial ? (
        <>
          <form.Field name="status">
            {(field) => {
              const currentStatus = initial.status
              return (
                <label className="block text-sm font-semibold">
                  {LL.crud.status()}
                  <select
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as (typeof statuses)[number],
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                  >
                    {statuses.map((status) => (
                      <option
                        key={status}
                        value={status}
                        disabled={
                          status !== currentStatus &&
                          !allowedStatusChanges[currentStatus].includes(status)
                        }
                      >
                        {LL.status[status]()}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }}
          </form.Field>
          <form.Field name="reason">
            {(field) => (
              <label className="block text-sm font-semibold">
                {LL.crud.reason()}
                <textarea
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                  rows={2}
                />
              </label>
            )}
          </form.Field>
        </>
      ) : null}
      <form.Field name="periodEnd">
        {(field) => (
          <label className="block text-sm font-semibold">
            {LL.crud.periodEnd()}
            <input
              type="date"
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
            {LL.crud.save()}
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}
function Page({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {kicker}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">{title}</h1>
      </header>
      {children}
    </div>
  )
}
