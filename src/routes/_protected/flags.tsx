import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getFlags, toggleTenantFlag } from '#/lib/ops.functions'
import { EmptyState } from '#/components/admin/empty-state'
import { useServerFn } from '@tanstack/react-start'

export const Route = createFileRoute('/_protected/flags')({
  loader: () => getFlags(),
  component: Flags,
})
function Flags() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const toggle = useServerFn(toggleTenantFlag)
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">
          Configuration
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">Feature flags</h1>
      </header>
      {data.flags.length === 0 ? (
        <EmptyState
          title="No feature flags"
          description="Flag definitions will appear here."
        />
      ) : (
        <div className="space-y-4">
          {data.flags.map((flag) => (
            <section
              key={flag.id}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"
            >
              <h2 className="font-serif text-2xl font-bold">{flag.key}</h2>
              <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
                {flag.description ?? 'No description'}
              </p>
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
                          void toggle({
                            data: {
                              tenantId: tenant.id,
                              flagKey: flag.key,
                              enabled: event.target.checked,
                            },
                          }).then(() => router.invalidate())
                        }}
                      />
                    </label>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
