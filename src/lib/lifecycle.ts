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

    if (to === 'CANCELED' && subscription.plan.isPermanent) {
      throw new Error('Permanent subscriptions cannot be canceled')
    }

    const now = new Date()
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: to,
        ...(to === 'DISABLED' ? { disabledAt: now } : {}),
        ...(to === 'ACTIVE' ? { disabledAt: null, graceEndsAt: null } : {}),
        ...(subscription.status === 'CANCELED' && to !== 'CANCELED'
          ? {
              canceledAt: null,
              cancelAt: null,
              cancellationRefundMinor: null,
            }
          : {}),
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
  let service: {
    deletedAt: Date | null
    tenantAssignments: Array<{
      flags: Array<{
        enabled: boolean
        serviceFlag: { key: string; deletedAt: Date | null }
      }>
    }>
  } | null = null
  if (options.serviceId) {
    service = await db.service.findUnique({
      where: { id: options.serviceId },
      include: {
        tenantAssignments: {
          where: { tenantId },
          include: {
            flags: { include: { serviceFlag: true } },
          },
        },
      },
    })
    if (
      !service ||
      service.deletedAt ||
      service.tenantAssignments.length === 0
    ) {
      throw new Error('Service not found')
    }
  }

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: {
      subscription: { include: { plan: true } },
    },
  })

  const subscription = tenant.subscription
  const now = new Date()
  if (tenant.deletedAt) {
    return {
      active: false,
      plan: null,
      planId: null,
      flags: {},
      periodEnd: null,
      planType: null,
      serialKeyMatches: false,
      serialKeySubmitted: false,
      status: null,
      reason: 'NO_SUBSCRIPTION' as const,
    }
  }
  if (!subscription) {
    return {
      active: false,
      plan: null,
      flags: {},
      periodEnd: null,
      planType: null,
      serialKeyMatches: false,
      serialKeySubmitted: false,
      status: null,
      reason: 'NO_SUBSCRIPTION' as const,
    }
  }
  if (subscription.deletedAt || subscription.status === 'ARCHIVED') {
    return {
      active: false,
      plan: null,
      planId: null,
      flags: {},
      periodEnd: null,
      planType: null,
      serialKeyMatches: false,
      serialKeySubmitted: false,
      status: null,
      reason: 'NO_SUBSCRIPTION' as const,
    }
  }
  const serialKeySubmitted =
    subscription.plan.type !== 'SERIAL_KEY' ||
    subscription.submittedSerialKey === subscription.serialKey
  const serialKeyMatches =
    subscription.plan.type !== 'SERIAL_KEY' ||
    (options.serialKey
      ? options.serialKey === subscription.serialKey
      : serialKeySubmitted)
  const hasValidSerialKey =
    !options.validateSerialKey ||
    subscription.plan.type !== 'SERIAL_KEY' ||
    serialKeyMatches
  const flags = Object.fromEntries(
    (service?.tenantAssignments[0]?.flags ?? [])
      .filter((assignment) => !assignment.serviceFlag.deletedAt)
      .map((assignment) => [assignment.serviceFlag.key, assignment.enabled]),
  )
  const isWithinPeriod =
    subscription.plan.isPermanent || now < subscription.currentPeriodEnd
  const isLifecycleActive =
    subscription.status === 'TRIALING' ||
    subscription.status === 'ACTIVE' ||
    subscription.status === 'PAST_DUE' ||
    subscription.status === 'DISABLED_AT_PERIOD_END'
  const active = hasValidSerialKey && isWithinPeriod && isLifecycleActive

  const reason = !hasValidSerialKey
    ? serialKeySubmitted
      ? ('SERIAL_KEY_INVALID' as const)
      : options.serialKey
        ? ('SERIAL_KEY_INVALID' as const)
        : ('SERIAL_KEY_NOT_SUBMITTED' as const)
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
    planId: subscription.planId,
    planType: subscription.plan.type,
    serialKeyMatches,
    serialKeySubmitted,
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
