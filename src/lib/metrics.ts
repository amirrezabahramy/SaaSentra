import type { SubscriptionStatus } from '#/generated/prisma/client'

export function isRevenueActive(
  status: SubscriptionStatus,
  periodEnd: Date,
  now = new Date(),
): boolean {
  return (
    now < periodEnd &&
    (status === 'TRIALING' ||
      status === 'ACTIVE' ||
      status === 'PAST_DUE' ||
      status === 'DISABLED_AT_PERIOD_END')
  )
}

type Currency = 'USD' | 'IRR'

type RevenueSummary = {
  recurring: Record<Currency, number>
  nonRecurring: Record<Currency, number>
}

function intervalDays(interval: string): number {
  const match = interval.match(/^(\d+)?\s*(day|week|month|year)s?$/i)
  if (!match) return 30
  const count = Number(match[1] || 1)
  const unit = match[2].toLowerCase()
  if (unit === 'day') return count
  if (unit === 'week') return count * 7
  if (unit === 'year') return count * 365
  return count * 30
}

export function calculateRevenueSummary(
  subscriptions: ReadonlyArray<{
    status: SubscriptionStatus
    currentPeriodEnd: Date
    plan: {
      priceMinor: number
      currency: Currency
      isPermanent: boolean
      interval: string
    }
  }>,
  now = new Date(),
): RevenueSummary {
  const summary: RevenueSummary = {
    recurring: { USD: 0, IRR: 0 },
    nonRecurring: { USD: 0, IRR: 0 },
  }
  for (const subscription of subscriptions) {
    if (
      !isRevenueActive(subscription.status, subscription.currentPeriodEnd, now)
    ) {
      continue
    }
    if (subscription.plan.isPermanent) {
      summary.nonRecurring[subscription.plan.currency] +=
        subscription.plan.priceMinor
    } else {
      summary.recurring[subscription.plan.currency] += Math.round(
        (subscription.plan.priceMinor * 30) /
          intervalDays(subscription.plan.interval),
      )
    }
  }
  return summary
}
