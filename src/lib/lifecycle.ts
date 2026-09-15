import { db } from '../db'
import type { Prisma, SubscriptionStatus } from '#/generated/prisma/client'

export const GRACE_NOTICE_DAYS = [7, 3, 1] as const

export const ALLOWED_TRANSITIONS: Record<
  SubscriptionStatus,
  readonly SubscriptionStatus[]
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

export type LifecycleOptions = {
  actorId?: string
  reason?: string
  metadata?: Record<string, unknown>
  graceEndsAt?: Date | null
  allowImmediateDisable?: boolean
}

function asJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject
}

function canTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** Apply one legal subscription transition and record exactly one audit row. */
export async function transitionSubscription(
  subscriptionId: string,
  to: SubscriptionStatus,
  options: LifecycleOptions = {},
) {
  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    })

    if (subscription.status === to) {
      return subscription
    }

    const isAuthorizedImmediateDisable =
      to === 'DISABLED' &&
      options.allowImmediateDisable === true &&
      Boolean(options.actorId)

    if (!canTransition(subscription.status, to) && !isAuthorizedImmediateDisable) {
      throw new Error(
        `Illegal subscription transition: ${subscription.status} -> ${to}`,
      )
    }

    const now = new Date()
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: to,
        ...(to === 'DISABLED' ? { disabledAt: now } : {}),
        ...(to === 'ACTIVE' ? { disabledAt: null, graceEndsAt: null } : {}),
        ...(options.graceEndsAt !== undefined
          ? { graceEndsAt: options.graceEndsAt }
          : {}),
      },
    })

    await tx.auditLog.create({
      data: {
        tenantId: subscription.tenantId,
        actorId: options.actorId,
        action: 'subscription.transitioned',
        entityType: 'Subscription',
        entityId: subscriptionId,
        metadata: asJsonObject({
          from: subscription.status,
          to,
          reason: options.reason ?? 'unspecified',
          ...options.metadata,
        }),
      },
    })

    return updated
  })
}

/** Return the current entitlement snapshot for a tenant. */
export async function getEntitlement(tenantId: string) {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: {
      subscription: { include: { plan: true } },
      flags: { include: { flag: true } },
    },
  })

  const subscription = tenant.subscription
  const now = new Date()
  const flags = Object.fromEntries(
    tenant.flags.map((tenantFlag) => [tenantFlag.flag.key, tenantFlag.enabled]),
  )
  const active = Boolean(
    subscription &&
      now < subscription.currentPeriodEnd &&
      (subscription.status === 'ACTIVE' ||
        subscription.status === 'DISABLED_AT_PERIOD_END'),
  )

  return {
    active,
    plan: subscription?.plan.slug ?? null,
    flags,
    periodEnd: subscription?.currentPeriodEnd ?? null,
  }
}

export async function disable(
  subscriptionId: string,
  reason: string,
  options: Omit<LifecycleOptions, 'reason'> = {},
) {
  return transitionSubscription(subscriptionId, 'DISABLED', {
    ...options,
    reason,
    allowImmediateDisable: true,
    metadata: { ...options.metadata, operatorDisable: true },
  })
}

export async function enable(
  subscriptionId: string,
  options: LifecycleOptions = {},
) {
  const subscription = await db.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    select: { status: true },
  })
  const target =
    subscription.status === 'CANCELED' ? 'DISABLED_AT_PERIOD_END' : 'ACTIVE'
  return transitionSubscription(subscriptionId, target, options)
}

export async function enterGracePeriod(
  subscriptionId: string,
  days: number,
  options: LifecycleOptions = {},
) {
  const graceEndsAt = new Date(Date.now() + days * 86_400_000)
  const updated = await transitionSubscription(subscriptionId, 'GRACE_PERIOD', {
    ...options,
    graceEndsAt,
    metadata: { ...options.metadata, graceEndsAt: graceEndsAt.toISOString() },
  })

  return updated
}
