import type { SubscriptionStatus } from '#/generated/prisma/client'

export function isRevenueActive(
  status: SubscriptionStatus,
  periodEnd: Date,
  now = new Date(),
): boolean {
  return (
    now < periodEnd &&
    (status === 'ACTIVE' || status === 'DISABLED_AT_PERIOD_END')
  )
}

export function calculateMrr(
  subscriptions: ReadonlyArray<{
    status: SubscriptionStatus
    currentPeriodEnd: Date
    plan: { priceCents: number }
  }>,
  now = new Date(),
): number {
  return subscriptions.reduce(
    (total, subscription) =>
      total +
      (isRevenueActive(subscription.status, subscription.currentPeriodEnd, now)
        ? subscription.plan.priceCents
        : 0),
    0,
  )
}
