import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getTenantDetail } from '#/lib/admin.functions'
import { EmptyState } from '#/components/admin/empty-state'
import { StatusBadge } from '#/components/admin/status-badge'
import { formatCurrency, formatDate } from '#/lib/format'
import { disableSubscription, enableSubscription } from '#/lib/ops.functions'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/tenants/$id')({
  loader: ({ params }) => getTenantDetail({ data: { id: params.id } }),
  pendingComponent: Loading,
  errorComponent: ({ error }) => <EmptyState title="Unable to load tenant" description={String(error)} />,
  component: TenantDetail,
})

function TenantDetail() {
  const tenant = Route.useLoaderData()
  const router = useRouter()
  const disable = useServerFn(disableSubscription)
  const enable = useServerFn(enableSubscription)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'disable' | 'enable' | null>(null)
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')
  if (!tenant) return <EmptyState title="Tenant not found" description="This tenant may have been removed." />
  const changeStatus = async (action: 'disable' | 'enable') => {
    if (!tenant.subscription) return
    try {
      setPending(true)
      setActionError(null)
      if (action === 'disable') await disable({ data: { subscriptionId: tenant.subscription.id, reason } })
      else await enable({ data: { subscriptionId: tenant.subscription.id, reason } })
      await router.invalidate()
      setPendingAction(null)
      setReason('')
      setConfirmText('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update subscription')
    } finally {
      setPending(false)
    }
  }
  const canEnable = ['DISABLED', 'CANCELED', 'DISABLED_AT_PERIOD_END'].includes(tenant.subscription?.status ?? '')
  const actionWord = pendingAction === 'enable' ? 'ENABLE' : 'DISABLE'
  return <div className="mx-auto max-w-6xl"><a href="/tenants" className="text-sm font-semibold text-[var(--palm)]">← Back to tenants</a><header className="mb-8 mt-5"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--kicker)]">Tenant</p><h1 className="mt-2 font-serif text-4xl font-bold">{tenant.name}</h1><p className="mt-2 text-[var(--sea-ink-soft)]">{tenant.slug}</p></header><section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><h2 className="font-serif text-2xl font-bold">Subscription</h2>{tenant.subscription ? <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><span>Plan</span><strong>{tenant.subscription.plan}</strong></div><div className="flex items-center justify-between"><span>Status</span><StatusBadge status={tenant.subscription.status} /></div><div className="flex items-center justify-between text-sm"><span>Period ends</span><span>{formatDate(tenant.subscription.currentPeriodEnd)}</span></div>{(['ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'DISABLED', 'CANCELED', 'DISABLED_AT_PERIOD_END'].includes(tenant.subscription.status)) && <button type="button" disabled={pending} onClick={() => { setPendingAction(canEnable ? 'enable' : 'disable'); setReason(''); setConfirmText(''); setActionError(null) }} className="mt-3 rounded-xl bg-[var(--sea-ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Updating…' : canEnable ? 'Re-enable subscription' : 'Disable subscription'}</button>}{actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}</div> : <div className="mt-5"><EmptyState title="No subscription" description="This tenant has no current subscription." /></div>}</div><div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><h2 className="font-serif text-2xl font-bold">Services & flags</h2><p className="mt-4 text-sm">{tenant.services.length} services · {tenant.flags.filter((flag) => flag.enabled).length} enabled flags</p><div className="mt-4 flex flex-wrap gap-2">{tenant.flags.length ? tenant.flags.map((flag) => <span key={flag.key} className="rounded-full bg-[var(--chip-bg)] px-3 py-1 text-sm">{flag.key}: {flag.enabled ? 'on' : 'off'}</span>) : <span className="text-sm text-[var(--sea-ink-soft)]">No flags configured</span>}</div></div></section><section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><h2 className="font-serif text-2xl font-bold">Invoices</h2>{tenant.invoices.length ? <div className="mt-4 divide-y divide-[var(--line)]">{tenant.invoices.map((invoice) => <div key={invoice.id} className="flex justify-between gap-4 py-3"><span>{invoice.number} · {invoice.status}</span><span>{formatCurrency(invoice.amountCents, invoice.currency)}</span></div>)}</div> : <div className="mt-4"><EmptyState title="No invoices" description="Invoices will appear once billing activity begins." /></div>}</section><section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><h2 className="font-serif text-2xl font-bold">Lifecycle timeline</h2>{tenant.auditLogs.length ? <div className="mt-4 space-y-5">{tenant.auditLogs.map((entry) => <div key={entry.id} className="border-l-2 border-[var(--lagoon)] pl-4"><div className="flex flex-wrap justify-between gap-2"><strong>{entry.action}</strong><time className="text-sm text-[var(--sea-ink-soft)]">{formatDate(entry.createdAt)}</time></div><p className="mt-1 text-sm text-[var(--sea-ink-soft)]">{entry.reason ?? 'No reason recorded'}{entry.actor ? ` · ${entry.actor.name ?? entry.actor.email}` : ''}</p></div>)}</div> : <div className="mt-4"><EmptyState title="No lifecycle events" description="Subscription history will appear here." /></div>}</section>{pendingAction ? <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--sea-ink)]/35 p-4"><div role="dialog" aria-modal="true" aria-labelledby="subscription-dialog-title" className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-2xl"><h2 id="subscription-dialog-title" className="font-serif text-2xl font-bold">{pendingAction === 'enable' ? 'Re-enable subscription' : 'Disable subscription'}</h2><p className="mt-2 text-sm text-[var(--sea-ink-soft)]">This changes the tenant’s access immediately and records an audit event.</p><label className="mt-5 block text-sm font-semibold">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3" /></label><label className="mt-4 block text-sm font-semibold">Type <code className="rounded bg-black/5 px-1.5 py-0.5">{actionWord}</code> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={actionWord} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setPendingAction(null)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={pending || !reason.trim() || confirmText !== actionWord} onClick={() => void changeStatus(pendingAction)} className="rounded-xl bg-[var(--sea-ink)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{pending ? 'Updating…' : `Yes, ${pendingAction}`}</button></div></div></div> : null}</div>
}
function Loading() { return <div className="animate-pulse text-[var(--sea-ink-soft)]">Loading tenant…</div> }
