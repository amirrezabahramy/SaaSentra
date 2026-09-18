import { randomBytes } from 'node:crypto'
import { db } from '../db'
import type { Prisma, SubscriptionStatus } from '#/generated/prisma/client'

export const GRACE_NOTICE_DAYS = [7, 3, 1] as const

export const ALLOWED_TRANSITIONS: Record<
  SubscriptionStatus,
  readonly SubscriptionStatus[]
> = {
  TRIALING: ['ACTIVE', 'PAST_DUE', 'CANCELED'],
  ACTIVE: ['PAST_DUE', 'CANCELED'],
  PAST_DUE: ['GRACE_PERIOD', 'ACTIVE', 'CANCELED'],
  GRACE_PERIOD: ['DISABLED', 'ACTIVE', 'CANCELED'],
  DISABLED: ['ACTIVE', 'ARCHIVED'],
  CANCELED: [],
  DISABLED_AT_PERIOD_END: ['DISABLED', 'CANCELED'],
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

function calculateCancellationRefundMinor(input: {
  status: SubscriptionStatus
  priceMinor: number
  currentPeriodStart: Date
  currentPeriodEnd: Date
  now: Date
}) {
  if (input.status === 'GRACE_PERIOD' || input.status === 'TRIALING') return 0
  const total =
    input.currentPeriodEnd.getTime() - input.currentPeriodStart.getTime()
  const remaining = input.currentPeriodEnd.getTime() - input.now.getTime()
  if (total <= 0 || remaining <= 0) return 0
  return Math.floor(input.priceMinor * Math.min(remaining / total, 1))
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
      include: { plan: true },
    })

    if (subscription.status === to) {
      return subscription
    }

    if (subscription.status === 'CANCELED') {
      throw new Error('Canceled subscriptions cannot be uncanceled')
    }
    if (to === 'CANCELED' && subscription.plan.isPermanent) {
      throw new Error('Permanent subscriptions cannot be canceled')
    }

    const isAuthorizedImmediateDisable =
      to === 'DISABLED' &&
      options.allowImmediateDisable === true &&
      Boolean(options.actorId)

    if (
      !canTransition(subscription.status, to) &&
      !isAuthorizedImmediateDisable
    ) {
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
        ...(to === 'CANCELED'
          ? {
              canceledAt: now,
              cancelAt: now,
              cancellationRefundMinor: calculateCancellationRefundMinor({
                status: subscription.status,
                priceMinor: subscription.plan.priceMinor,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                now,
              }),
            }
          : {}),
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
export function generateSerialKey() {
  return `SK-${randomBytes(18).toString('base64url').toUpperCase()}`
}

export async function getEntitlement(
  tenantId: string,
  options: {
    validateSerialKey?: boolean
    serialKey?: string
    serviceId?: string
  } = {},
) {
  if (options.serviceId) {
    const service = await db.service.findUnique({
      where: { id: options.serviceId },
      select: { tenantId: true, deletedAt: true },
    })
    if (!service || service.deletedAt || service.tenantId !== tenantId) {
      throw new Error('Service not found')
    }
  }

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: {
      subscription: { include: { plan: true } },
      flags: { include: { flag: true } },
    },
  })

  const subscription = tenant.subscription
  const now = new Date()
  if (tenant.deletedAt) {
    return {
      active: false,
      plan: null,
      flags: {},
      periodEnd: null,
      planType: null,
      status: subscription?.status ?? null,
      reason: 'TENANT_ARCHIVED' as const,
    }
  }
  if (!subscription) {
    return {
      active: false,
      plan: null,
      flags: {},
      periodEnd: null,
      planType: null,
      status: null,
      reason: 'NO_SUBSCRIPTION' as const,
    }
  }
  if (subscription.deletedAt || subscription.status === 'ARCHIVED') {
    return {
      active: false,
      plan: subscription.plan.slug,
      flags: {},
      periodEnd: subscription.plan.isPermanent
        ? null
        : subscription.currentPeriodEnd,
      planType: subscription.plan.type,
      status: subscription.status,
      reason: 'SUBSCRIPTION_ARCHIVED' as const,
    }
  }
  const hasValidSerialKey =
    !options.validateSerialKey ||
    subscription.plan.type !== 'SERIAL_KEY' ||
    Boolean(
      options.serialKey &&
      options.serialKey === subscription.serialKey &&
      subscription.submittedSerialKey === options.serialKey,
    )
  const flags = Object.fromEntries(
    tenant.flags
      .filter((tenantFlag) => !tenantFlag.flag.deletedAt)
      .map((tenantFlag) => [tenantFlag.flag.key, tenantFlag.enabled]),
  )
  const isWithinPeriod =
    subscription.plan.isPermanent || now < subscription.currentPeriodEnd
  const isLifecycleActive =
    subscription.status === 'TRIALING' ||
    subscription.status === 'ACTIVE' ||
    subscription.status === 'PAST_DUE' ||
    subscription.status === 'DISABLED_AT_PERIOD_END'
  const active = hasValidSerialKey && isWithinPeriod && isLifecycleActive

  const serialKeyMatches =
    subscription.plan.type !== 'SERIAL_KEY' ||
    options.serialKey === subscription.serialKey
  const reason = !hasValidSerialKey
    ? serialKeyMatches
      ? ('SERIAL_KEY_NOT_SUBMITTED' as const)
      : ('SERIAL_KEY_INVALID' as const)
    : !isWithinPeriod
      ? ('EXPIRED' as const)
      : !isLifecycleActive
        ? subscription.status
        : subscription.status === 'PAST_DUE'
          ? ('PAST_DUE' as const)
          : subscription.status === 'TRIALING'
            ? ('TRIALING' as const)
            : ('ACTIVE' as const)

  return {
    active,
    plan: subscription.plan.slug,
    planType: subscription.plan.type,
    flags,
    periodEnd: subscription.plan.isPermanent
      ? null
      : subscription.currentPeriodEnd,
    status: subscription.status,
    reason,
  }
}

export async function disable(
  subscriptionId: string,
  reason?: string,
  options: Omit<LifecycleOptions, 'reason'> = {},
) {
  return transitionSubscription(subscriptionId, 'DISABLED', {
    ...options,
    reason: reason ?? 'Subscription disabled by operator',
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
  if (subscription.status === 'CANCELED') {
    throw new Error('Canceled subscriptions cannot be uncanceled')
  }
  return transitionSubscription(subscriptionId, 'ACTIVE', options)
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
