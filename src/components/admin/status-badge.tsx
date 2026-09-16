import type { SubscriptionStatus } from '#/generated/prisma/client'
import { useI18nContext } from '#/i18n/i18n-react'

const styles: Record<SubscriptionStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  TRIALING: 'bg-sky-100 text-sky-800',
  PAST_DUE: 'bg-amber-100 text-amber-800',
  GRACE_PERIOD: 'bg-orange-100 text-orange-800',
  DISABLED: 'bg-red-100 text-red-800',
  CANCELED: 'bg-slate-200 text-slate-700',
  DISABLED_AT_PERIOD_END: 'bg-purple-100 text-purple-800',
  ARCHIVED: 'bg-slate-300 text-slate-700',
}

export function StatusBadge({ status }: { status: SubscriptionStatus | null }) {
  const { LL } = useI18nContext()
  if (!status) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
        {LL.tenantDetail.noSubscription()}
      </span>
    )
  }
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {LL.status[status]()}
    </span>
  )
}
