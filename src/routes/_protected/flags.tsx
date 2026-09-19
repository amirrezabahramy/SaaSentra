import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { CopyableValue } from '#/components/admin/copyable-value'
import { CrudDialog } from '#/components/admin/crud-dialog'
import { EmptyState } from '#/components/admin/empty-state'
import {
  assignServiceToTenant,
  rotateTenantServiceApiKey,
  toggleTenantServiceFlag,
  updateTenantService,
  unassignServiceFromTenant,
} from '#/lib/ops.functions'
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
  const assign = useServerFn(assignServiceToTenant)
  const unassign = useServerFn(unassignServiceFromTenant)
  const toggle = useServerFn(toggleTenantServiceFlag)
  const updateConfig = useServerFn(updateTenantService)
  const rotateKey = useServerFn(rotateTenantServiceApiKey)
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null)
  const assignmentMutation = useMutation({
    mutationFn: async (input: {
      serviceId: string
      tenantId: string
      assigned: boolean
    }) => {
      if (input.assigned) {
        return assign({ data: input })
      } else {
        await unassign({ data: input })
        return undefined
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] })
      if (result?.apiKey) setGeneratedApiKey(result.apiKey)
    },
  })
  const configMutation = useMutation({
    mutationFn: (input: TenantServiceConfig) => updateConfig({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] }),
  })
  const rotateKeyMutation = useMutation({
    mutationFn: (input: ServiceAssignmentInput) => rotateKey({ data: input }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] })
      setGeneratedApiKey(result.apiKey)
    },
  })
  const flagMutation = useMutation({
    mutationFn: (input: {
      serviceId: string
      tenantId: string
      serviceFlagId: string
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
        <p className="mt-3 max-w-2xl text-sm text-(--sea-ink-soft)">
          {LL.flags.noFlagsDescription()}
        </p>
        <button
          type="button"
          onClick={() => setIncludeArchived((value) => !value)}
          className="mt-4 rounded-xl border border-(--line) px-4 py-2 text-sm font-semibold"
        >
          {includeArchived ? LL.crud.hideArchived() : LL.crud.showArchived()}
        </button>
      </header>
      {data.services.length === 0 ? (
        <EmptyState
          title={LL.flags.noFlags()}
          description={LL.flags.noFlagsDescription()}
        />
      ) : (
        <div className="space-y-5">
          {data.services.map((service) => (
            <section
              key={service.id}
              className="rounded-2xl border border-(--line) bg-(--surface) p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-(--kicker)">
                    {LL.services.title()}
                  </p>
                  <h2 className="font-serif text-2xl font-bold">
                    {service.name}
                  </h2>
                  <p className="mt-1 text-sm text-(--sea-ink-soft)">
                    {service.flags.map((flag) => flag.key).join(', ') ||
                      LL.services.none()}
                  </p>
                </div>
                {service.archived ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    ARCHIVED
                  </span>
                ) : null}
              </div>
              {!service.archived ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {data.tenants.map((tenant) => {
                    const assignment = service.assignments.find(
                      (item) => item.tenantId === tenant.id,
                    )
                    return (
                      <div
                        key={tenant.id}
                        className="rounded-xl border border-(--line) bg-white/50 p-4"
                      >
                        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                          <span>{tenant.name}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(assignment)}
                            disabled={assignmentMutation.isPending}
                            onChange={(event) =>
                              void assignmentMutation.mutateAsync({
                                serviceId: service.id,
                                tenantId: tenant.id,
                                assigned: event.target.checked,
                              })
                            }
                          />
                        </label>
                        {assignment ? (
                          <div className="mt-3 space-y-2 border-t border-(--line) pt-3">
                            <AssignmentConfig
                              assignment={assignment}
                              emailDeliveryAvailable={
                                data.emailDeliveryAvailable
                              }
                              isPending={configMutation.isPending}
                              onSubmit={(value) =>
                                void configMutation.mutateAsync({
                                  ...value,
                                  serviceId: service.id,
                                  tenantId: tenant.id,
                                })
                              }
                              onRotateKey={() =>
                                void rotateKeyMutation.mutateAsync({
                                  serviceId: service.id,
                                  tenantId: tenant.id,
                                })
                              }
                              rotatePending={rotateKeyMutation.isPending}
                            />
                            {service.flags.map((flag) => {
                              const assignedFlag = assignment.flags.find(
                                (item) => item.serviceFlagId === flag.id,
                              )
                              return (
                                <label
                                  key={flag.id}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <span>{flag.key}</span>
                                  <input
                                    type="checkbox"
                                    checked={assignedFlag?.enabled ?? false}
                                    disabled={flagMutation.isPending}
                                    onChange={(event) =>
                                      void flagMutation.mutateAsync({
                                        serviceId: service.id,
                                        tenantId: tenant.id,
                                        serviceFlagId: flag.id,
                                        enabled: event.target.checked,
                                      })
                                    }
                                  />
                                </label>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
      {generatedApiKey ? (
        <CrudDialog
          title="Tenant service API key generated"
          onClose={() => setGeneratedApiKey(null)}
        >
          <p className="text-sm text-(--sea-ink-soft)">
            Copy this key now. It will not be shown again.
          </p>
          <CopyableValue
            value={generatedApiKey}
            label="Copy API key"
            copiedLabel={LL.crud.copied()}
          />
        </CrudDialog>
      ) : null}
    </div>
  )
}

type ServiceAssignmentInput = { serviceId: string; tenantId: string }
type TenantServiceConfig = ServiceAssignmentInput & {
  deployStatus: 'HEALTHY' | 'DEGRADED' | 'OFFLINE'
  paymentCallbackUrl: string | null
  paymentCallbackSecret: string | null
  paymentDeliveryMode: 'CALLBACK' | 'EMAIL' | 'CALLBACK_AND_EMAIL'
}

function AssignmentConfig({
  assignment,
  emailDeliveryAvailable,
  isPending,
  onSubmit,
  onRotateKey,
  rotatePending,
}: {
  assignment: {
    billingEmail: string | null
    deployStatus: TenantServiceConfig['deployStatus']
    paymentCallbackUrl: string | null
    paymentDeliveryMode: TenantServiceConfig['paymentDeliveryMode']
    serviceApiKeyLastFour: string | null
  }
  emailDeliveryAvailable: boolean
  isPending: boolean
  onSubmit: (value: Omit<TenantServiceConfig, 'serviceId' | 'tenantId'>) => void
  onRotateKey: () => void
  rotatePending: boolean
}) {
  const form = useForm({
    defaultValues: {
      deployStatus: assignment.deployStatus,
      paymentCallbackUrl: assignment.paymentCallbackUrl ?? '',
      paymentCallbackSecret: '',
      paymentDeliveryMode: assignment.paymentDeliveryMode,
    },
    onSubmit: ({ value }) =>
      onSubmit({
        ...value,
        paymentCallbackUrl: value.paymentCallbackUrl.trim() || null,
        paymentCallbackSecret: value.paymentCallbackSecret.trim() || null,
      }),
  })
  return (
    <form
      className="space-y-2 rounded-lg bg-(--surface) p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <form.Field name="deployStatus">
          {(field) => (
            <label className="text-xs font-semibold">
              Deploy status
              <select
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(
                    event.target.value as TenantServiceConfig['deployStatus'],
                  )
                }
                className="mt-1 w-full rounded-lg border border-(--line) bg-white px-2 py-2 text-sm"
              >
                <option value="HEALTHY">HEALTHY</option>
                <option value="DEGRADED">DEGRADED</option>
                <option value="OFFLINE">OFFLINE</option>
              </select>
            </label>
          )}
        </form.Field>
        <form.Field name="paymentDeliveryMode">
          {(field) => (
            <label className="text-xs font-semibold">
              Payment delivery mode
              <select
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(
                    event.target
                      .value as TenantServiceConfig['paymentDeliveryMode'],
                  )
                }
                className="mt-1 w-full rounded-lg border border-(--line) bg-white px-2 py-2 text-sm"
              >
                <option value="CALLBACK">CALLBACK</option>
                {emailDeliveryAvailable && assignment.billingEmail ? (
                  <>
                    <option value="EMAIL">EMAIL</option>
                    <option value="CALLBACK_AND_EMAIL">
                      CALLBACK_AND_EMAIL
                    </option>
                  </>
                ) : null}
              </select>
            </label>
          )}
        </form.Field>
      </div>
      <form.Field name="paymentCallbackUrl">
        {(field) => (
          <input
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder="Payment callback URL"
            className="w-full rounded-lg border border-(--line) bg-white px-2 py-2 text-sm"
          />
        )}
      </form.Field>
      <form.Field name="paymentCallbackSecret">
        {(field) => (
          <input
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder="Payment callback secret (leave blank to keep current)"
            className="w-full rounded-lg border border-(--line) bg-white px-2 py-2 text-sm"
          />
        )}
      </form.Field>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-(--sea-ink) px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Save configuration
        </button>
        <button
          type="button"
          disabled={rotatePending}
          onClick={onRotateKey}
          className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40"
        >
          Regenerate API key
        </button>
        {assignment.serviceApiKeyLastFour ? (
          <span className="text-xs text-(--sea-ink-soft)">
            Current key: ****{assignment.serviceApiKeyLastFour}
          </span>
        ) : null}
      </div>
    </form>
  )
}
