import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { EmptyState } from '#/components/admin/empty-state'
import { StatusBadge } from '#/components/admin/status-badge'
import { formatCurrency, formatDate } from '#/lib/format'
import {
  disableSubscription,
  enableSubscription,
  regenerateSerialKey,
  archiveTenant,
  updateTenant,
} from '#/lib/ops.functions'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { tenantDetailQuery } from '#/lib/queries'
import { useI18nContext } from '#/i18n/i18n-react'
import { CrudDialog } from '#/components/admin/crud-dialog'
import { SerialKey } from '#/components/admin/serial-key'

export const Route = createFileRoute('/_protected/tenants/$id')({
  loader: ({ context, params }) =>
    context.queryClient.query(tenantDetailQuery(params.id)),
  pendingComponent: Loading,
  errorComponent: ({ error }) => <TenantErrorState message={String(error)} />,
  component: TenantDetail,
})

function TenantDetail() {
  const { LL } = useI18nContext()
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(tenantDetailQuery(id))
  const tenant = data
  const queryClient = useQueryClient()
  const disable = useServerFn(disableSubscription)
  const enable = useServerFn(enableSubscription)
  const regenerate = useServerFn(regenerateSerialKey)
  const update = useServerFn(updateTenant)
  const archive = useServerFn(archiveTenant)
  const [tenantDialog, setTenantDialog] = useState<'edit' | 'archive' | null>(
    null,
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<
    'disable' | 'enable' | null
  >(null)
  const statusMutation = useMutation({
    mutationFn: async (input: {
      action: 'disable' | 'enable'
      subscriptionId: string
      reason: string
    }) =>
      input.action === 'disable'
        ? disable({
            data: {
              subscriptionId: input.subscriptionId,
              reason: input.reason,
            },
          })
        : enable({
            data: {
              subscriptionId: input.subscriptionId,
              reason: input.reason,
            },
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
  const regenerateMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      regenerate({ data: { id: subscriptionId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
  const tenantMutation = useMutation({
    mutationFn: (value: { name: string; slug: string }) =>
      update({ data: { id, ...value } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      setTenantDialog(null)
    },
  })
  const archiveMutation = useMutation({
    mutationFn: () => archive({ data: { id, reason: 'Archived by operator' } }),
    onSuccess: () => void navigate({ to: '/tenants', search: { search: '' } }),
  })
  const actionForm = useForm({
    defaultValues: { reason: '', confirmation: '' },
    onSubmit: async ({ value }) => {
      if (!pendingAction || !tenant?.subscription) return
      setActionError(null)
      try {
        await statusMutation.mutateAsync({
          action: pendingAction,
          subscriptionId: tenant.subscription.id,
          reason: value.reason,
        })
        setPendingAction(null)
        actionForm.reset()
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : LL.tenantDetail.unableToUpdate(),
        )
      }
    },
    validators: {
      onSubmit: ({ value }) =>
        !value.reason.trim() ||
        value.confirmation !==
          (pendingAction === 'enable' ? 'ENABLE' : 'DISABLE')
          ? LL.tenantDetail.confirmationRequired()
          : undefined,
    },
  })
  if (!tenant)
    return (
      <EmptyState
        title={LL.tenants.notFound()}
        description={LL.tenants.notFoundDescription()}
      />
    )
  const canEnable = ['DISABLED', 'CANCELED', 'DISABLED_AT_PERIOD_END'].includes(
    tenant.subscription?.status ?? '',
  )
  const actionWord = pendingAction === 'enable' ? 'ENABLE' : 'DISABLE'
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to="/tenants"
        search={{ search: '' }}
        className="text-sm font-semibold text-(--palm)"
      >
        {LL.tenants.back()}
      </Link>
      <header className="mb-8 mt-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-(--kicker)">
          {LL.tenants.tenant()}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">{tenant.name}</h1>
        <p className="mt-2 text-(--sea-ink-soft)">{tenant.slug}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTenantDialog('edit')}
            className="rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
          >
            {LL.tenants.edit()}
          </button>
          <button
            type="button"
            onClick={() => setTenantDialog('archive')}
            disabled={archiveMutation.isPending}
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
          >
            {LL.tenants.archive()}
          </button>
        </div>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-(--line) bg-(--surface) p-6">
          <h2 className="font-serif text-2xl font-bold">
            {LL.tenantDetail.subscription()}
          </h2>
          {tenant.subscription ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <span>{LL.tenantDetail.plan()}</span>
                <strong>{tenant.subscription.plan}</strong>
              </div>
              {tenant.subscription.planType === 'SERIAL_KEY' &&
              tenant.subscription.serialKey ? (
                <div className="text-sm">
                  <span>{LL.subscriptions.serialKey()}</span>
                  <SerialKey value={tenant.subscription.serialKey} />
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span>{LL.tenantDetail.status()}</span>
                <StatusBadge status={tenant.subscription.status} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>{LL.tenantDetail.periodEnds()}</span>
                <span>
                  {tenant.subscription.isPermanent
                    ? LL.plans.permanent()
                    : formatDate(tenant.subscription.currentPeriodEnd)}
                </span>
              </div>
              {tenant.subscription.planType === 'SERIAL_KEY' ? (
                <button
                  type="button"
                  onClick={() =>
                    void regenerateMutation.mutateAsync(tenant.subscription!.id)
                  }
                  disabled={regenerateMutation.isPending}
                  className="rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  {LL.subscriptions.regenerateKey()}
                </button>
              ) : null}
              {[
                'ACTIVE',
                'PAST_DUE',
                'GRACE_PERIOD',
                'DISABLED',
                'CANCELED',
                'DISABLED_AT_PERIOD_END',
              ].includes(tenant.subscription.status) && (
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => {
                    setPendingAction(canEnable ? 'enable' : 'disable')
                    actionForm.reset()
                    setActionError(null)
                  }}
                  className="mt-3 rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {statusMutation.isPending
                    ? LL.tenantDetail.updating()
                    : canEnable
                      ? LL.tenantDetail.enable()
                      : LL.tenantDetail.disable()}
                </button>
              )}
              {actionError ? (
                <p className="text-sm text-red-700">{actionError}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState
                title={LL.tenantDetail.noSubscription()}
                description={LL.tenantDetail.noSubscriptionDescription()}
              />
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-(--line) bg-(--surface) p-6">
          <h2 className="font-serif text-2xl font-bold">
            {LL.tenantDetail.servicesAndFlags()}
          </h2>
          <p className="mt-4 text-sm">
            {tenant.services.length} {LL.tenantDetail.services()} ·{' '}
            {tenant.flags.filter((flag) => flag.enabled).length}{' '}
            {LL.tenantDetail.enabledFlags()}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tenant.flags.length ? (
              tenant.flags.map((flag) => (
                <span
                  key={flag.key}
                  className="rounded-full bg-(--chip-bg) px-3 py-1 text-sm"
                >
                  {flag.key}:{' '}
                  {flag.enabled ? LL.tenantDetail.on() : LL.tenantDetail.off()}
                </span>
              ))
            ) : (
              <span className="text-sm text-(--sea-ink-soft)">
                {LL.tenantDetail.noFlags()}
              </span>
            )}
          </div>
        </div>
      </section>
      <section className="mt-8 rounded-2xl border border-(--line) bg-(--surface) p-6">
        <h2 className="font-serif text-2xl font-bold">
          {LL.tenantDetail.invoices()}
        </h2>
        {tenant.invoices.length ? (
          <div className="mt-4 divide-y divide-(--line)">
            {tenant.invoices.map((invoice) => (
              <div key={invoice.id} className="flex justify-between gap-4 py-3">
                <span>
                  {invoice.number} · {invoice.status}
                </span>
                <span>
                  {formatCurrency(invoice.amountCents, invoice.currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title={LL.tenantDetail.noInvoices()}
              description={LL.tenantDetail.noInvoicesDescription()}
            />
          </div>
        )}
      </section>
      <section className="mt-8 rounded-2xl border border-(--line) bg-(--surface) p-6">
        <h2 className="font-serif text-2xl font-bold">
          {LL.tenantDetail.lifecycle()}
        </h2>
        {tenant.auditLogs.length ? (
          <div className="mt-4 space-y-5">
            {tenant.auditLogs.map((entry) => (
              <div key={entry.id} className="border-s-2 border-(--lagoon) ps-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{entry.action}</strong>
                  <time className="text-sm text-(--sea-ink-soft)">
                    {formatDate(entry.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-(--sea-ink-soft)">
                  {entry.reason ?? LL.common.noReason()}
                  {entry.actor
                    ? ` · ${entry.actor.name ?? entry.actor.email}`
                    : ''}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title={LL.tenantDetail.noLifecycle()}
              description={LL.tenantDetail.noLifecycleDescription()}
            />
          </div>
        )}
      </section>
      {pendingAction ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-(--sea-ink)/35 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-dialog-title"
            className="w-full max-w-md rounded-2xl border border-(--line) bg-white p-6 shadow-2xl dark:bg-[#0f1b1f]"
          >
            <h2
              id="subscription-dialog-title"
              className="font-serif text-2xl font-bold"
            >
              {pendingAction === 'enable'
                ? LL.tenantDetail.dialogEnable()
                : LL.tenantDetail.dialogDisable()}
            </h2>
            <p className="mt-2 text-sm text-(--sea-ink-soft)">
              {LL.tenantDetail.dialogDescription()}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void actionForm.handleSubmit()
              }}
            >
              <actionForm.Field name="reason">
                {(field) => (
                  <label className="mt-5 block text-sm font-semibold">
                    {LL.tenantDetail.reason()}
                    <input
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={LL.tenantDetail.requiredReason()}
                      className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                    />
                  </label>
                )}
              </actionForm.Field>
              <actionForm.Field name="confirmation">
                {(field) => (
                  <label className="mt-4 block text-sm font-semibold">
                    {LL.tenantDetail.typeToConfirm()}{' '}
                    <code className="rounded bg-black/5 px-1.5 py-0.5">
                      {actionWord}
                    </code>{' '}
                    {LL.tenantDetail.toConfirm()}
                    <input
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder={actionWord}
                      className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                    />
                  </label>
                )}
              </actionForm.Field>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => setPendingAction(null)}
                  className="rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
                >
                  {LL.tenantDetail.cancel()}
                </button>
                <actionForm.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting]}
                >
                  {([canSubmit, isSubmitting]) => (
                    <button
                      type="submit"
                      disabled={
                        !canSubmit || isSubmitting || statusMutation.isPending
                      }
                      className="rounded-xl bg-(--sea-ink) px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSubmitting || statusMutation.isPending
                        ? LL.tenantDetail.updating()
                        : pendingAction === 'enable'
                          ? LL.tenantDetail.yesEnable()
                          : LL.tenantDetail.yesDisable()}
                    </button>
                  )}
                </actionForm.Subscribe>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {tenantDialog === 'edit' ? (
        <CrudDialog
          title={LL.tenants.edit()}
          onClose={() => setTenantDialog(null)}
        >
          <TenantEditForm
            initial={{ name: tenant.name, slug: tenant.slug }}
            isPending={tenantMutation.isPending}
            onSubmit={(value) => void tenantMutation.mutateAsync(value)}
          />
        </CrudDialog>
      ) : null}
      {tenantDialog === 'archive' ? (
        <CrudDialog
          title={LL.tenants.archive()}
          onClose={() => setTenantDialog(null)}
        >
          <p className="mt-4 text-sm text-(--sea-ink-soft)">
            {LL.tenants.archivedDescription()}
          </p>
          <button
            type="button"
            onClick={() => void archiveMutation.mutateAsync()}
            disabled={archiveMutation.isPending}
            className="mt-5 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {LL.crud.archive()}
          </button>
        </CrudDialog>
      ) : null}
    </div>
  )
}

function TenantEditForm({
  initial,
  isPending,
  onSubmit,
}: {
  initial: { name: string; slug: string }
  isPending: boolean
  onSubmit: (value: { name: string; slug: string }) => void
}) {
  const { LL } = useI18nContext()
  const form = useForm({
    defaultValues: initial,
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
      {(['name', 'slug'] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label className="block text-sm font-semibold">
              {name === 'name' ? LL.crud.name() : LL.crud.slug()}
              <input
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                className="mt-2 w-full rounded-xl border border-(--line) bg-white/70 px-4 py-3"
                required
              />
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
function Loading() {
  const { LL } = useI18nContext()
  return (
    <div className="animate-pulse text-(--sea-ink-soft)">
      {LL.tenants.loading()}
    </div>
  )
}

function TenantErrorState({ message }: { message: string }) {
  const { LL } = useI18nContext()
  return <EmptyState title={LL.tenants.unableToLoad()} description={message} />
}
