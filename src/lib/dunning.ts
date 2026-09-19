import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { db } from '../db'
import { sendDunningEmail, isEmailConfigured } from './email'
import {
  GRACE_NOTICE_DAYS,
  disable,
  enterGracePeriod,
  transitionSubscription,
} from './lifecycle'

const PAST_DUE_GRACE_THRESHOLD_DAYS = 3
const GRACE_PERIOD_DAYS = 7
const MAX_NOTICE_ATTEMPTS = 3
const DAY_MS = 86_400_000

function wholeDaysUntil(date: Date, now: Date): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS)
}

async function sendNotice(input: {
  subscriptionId: string
  tenantId: string
  tenantName: string
  email: string | null
  noticeType: string
  periodKey: string
  subject: string
  message: string
}): Promise<boolean> {
  const notice = await db.dunningNotice.upsert({
    where: {
      subscriptionId_noticeType_periodKey: {
        subscriptionId: input.subscriptionId,
        noticeType: input.noticeType,
        periodKey: input.periodKey,
      },
    },
    create: {
      subscriptionId: input.subscriptionId,
      tenantId: input.tenantId,
      noticeType: input.noticeType,
      periodKey: input.periodKey,
      toEmail: input.email,
    },
    update: { toEmail: input.email },
    select: { id: true, status: true, attempts: true, nextAttemptAt: true },
  })

  if (notice.status === 'SENT') {
    return false
  }

  if (!input.email || !isEmailConfigured()) {
    await db.dunningNotice.update({
      where: { id: notice.id },
      data: {
        status: 'NOT_CONFIGURED',
        nextAttemptAt: null,
        lastError: input.email
          ? 'SMTP email delivery is not configured'
          : 'Tenant billing email is not configured',
      },
    })
    return false
  }

  if (notice.attempts >= MAX_NOTICE_ATTEMPTS) {
    return false
  }

  const retryAt = notice.nextAttemptAt
  if (retryAt !== null && retryAt > new Date()) {
    return false
  }

  const claimed = await db.dunningNotice.updateMany({
    where: {
      id: notice.id,
      status: { in: ['PENDING', 'FAILED', 'NOT_CONFIGURED'] },
      attempts: { lt: MAX_NOTICE_ATTEMPTS },
    },
    data: {
      status: 'SENDING',
      attempts: { increment: 1 },
      lastError: null,
      nextAttemptAt: null,
    },
  })

  if (claimed.count !== 1) {
    return false
  }

  try {
    await sendDunningEmail({
      to: input.email,
      tenantName: input.tenantName,
      subject: input.subject,
      message: input.message,
    })
    await db.dunningNotice.update({
      where: { id: notice.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
      },
    })
    return true
  } catch (error) {
    await db.dunningNotice.update({
      where: { id: notice.id },
      data: {
        status: 'FAILED',
        nextAttemptAt: new Date(
          Date.now() + Math.min(60, 2 ** Math.max(0, notice.attempts)) * 60_000,
        ),
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Email delivery failed',
      },
    })
    return false
  }
}

/** Process overdue subscriptions and grace-period notices. */
export async function runDunning(now = new Date()) {
  let movedToDisabled = 0
  let movedToGrace = 0
  let movedToPastDue = 0
  let noticesSent = 0
  const expiredTrialIds = new Set<string>()
  const expiredTrials = await db.subscription.findMany({
    where: {
      status: 'TRIALING',
      currentPeriodEnd: { lte: now },
      deletedAt: null,
    },
    select: { id: true },
  })

  for (const subscription of expiredTrials) {
    await transitionSubscription(subscription.id, 'PAST_DUE', {
      reason: 'trial_period_ended',
      metadata: { source: 'dunning' },
    })
    expiredTrialIds.add(subscription.id)
    movedToPastDue += 1
  }

  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ['PAST_DUE', 'GRACE_PERIOD'] },
      deletedAt: null,
    },
    include: { tenant: true },
  })

  for (const subscription of subscriptions) {
    const periodKey = subscription.currentPeriodEnd.toISOString()

    if (subscription.status === 'PAST_DUE') {
      if (expiredTrialIds.has(subscription.id)) {
        if (
          await sendNotice({
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
            tenantName: subscription.tenant.name,
            email: subscription.tenant.billingEmail,
            noticeType: 'TRIAL_ENDED',
            periodKey,
            subject: 'Your trial has ended',
            message:
              'Your trial period has ended. Please complete payment to continue using the service.',
          })
        ) {
          noticesSent += 1
        }
        continue
      }

      if (subscription.currentPeriodEnd > now) {
        if (
          await sendNotice({
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
            tenantName: subscription.tenant.name,
            email: subscription.tenant.billingEmail,
            noticeType: 'PAYMENT_FAILED_ACTIVE_PERIOD',
            periodKey,
            subject: 'Payment failed',
            message:
              'Your current paid period is still active. Please complete payment before it ends.',
          })
        ) {
          noticesSent += 1
        }
        continue
      }

      const pastDueDays = wholeDaysUntil(subscription.updatedAt, now) * -1
      if (pastDueDays > PAST_DUE_GRACE_THRESHOLD_DAYS) {
        await enterGracePeriod(subscription.id, GRACE_PERIOD_DAYS, {
          reason: 'past_due_grace_threshold_reached',
        })
        movedToGrace += 1
      }

      if (
        await sendNotice({
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
          tenantName: subscription.tenant.name,
          email: subscription.tenant.billingEmail,
          noticeType: 'PAYMENT_FAILED',
          periodKey,
          subject: 'Payment failed',
          message:
            'We could not charge your payment method. Please complete payment to continue using the service.',
        })
      ) {
        noticesSent += 1
      }
      continue
    }

    if (!subscription.graceEndsAt) {
      continue
    }

    const remainingDays = wholeDaysUntil(subscription.graceEndsAt, now)
    const gracePeriodKey = subscription.graceEndsAt.toISOString()
    if (remainingDays < 0) {
      await disable(subscription.id, 'grace_period_expired')
      movedToDisabled += 1
      if (
        await sendNotice({
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
          tenantName: subscription.tenant.name,
          email: subscription.tenant.billingEmail,
          noticeType: 'ACCOUNT_DISABLED',
          periodKey: gracePeriodKey,
          subject: 'Your account has been disabled',
          message:
            'Your grace period has ended. Complete payment and contact the service administrator to restore access.',
        })
      ) {
        noticesSent += 1
      }
      continue
    }

    if (GRACE_NOTICE_DAYS.includes(remainingDays as 7 | 3 | 1)) {
      if (
        await sendNotice({
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
          tenantName: subscription.tenant.name,
          email: subscription.tenant.billingEmail,
          noticeType: `GRACE_${remainingDays}_DAYS`,
          periodKey: gracePeriodKey,
          subject: `Action required: ${remainingDays} day(s) until suspension`,
          message: `Your account will be disabled in ${remainingDays} day(s). Please complete payment before the grace period ends.`,
        })
      ) {
        noticesSent += 1
      }
    }
  }

  return { movedToDisabled, movedToGrace, movedToPastDue, noticesSent }
}

/** Backward-compatible name for callers from the scaffold. */
export const runDunningScan = runDunning

/** Run every four hours in the server process. */
export function startDunningJob(): ScheduledTask {
  return cron.schedule('0 */4 * * *', async () => {
    try {
      await runDunning()
    } catch (error) {
      console.error('[dunning] scan failed', error)
    }
  })
}
