import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { db } from '../db'
import {
  GRACE_NOTICE_DAYS,
  disable,
  enterGracePeriod,
  transitionSubscription,
} from './lifecycle'

const PAST_DUE_GRACE_THRESHOLD_DAYS = 3
const GRACE_PERIOD_DAYS = 7
const DAY_MS = 86_400_000

async function sendNotice(
  _email: string,
  _subject: string,
  _body: string,
): Promise<void> {
  // Placeholder for Resend/Postmark/SES integration in a later phase.
  console.info('[dunning] notice queued')
}

function wholeDaysUntil(date: Date, now: Date): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS)
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
    include: {
      tenant: true,
    },
  })

  for (const subscription of subscriptions) {
    const email = subscription.tenant.billingEmail

    if (subscription.status === 'PAST_DUE') {
      if (expiredTrialIds.has(subscription.id)) {
        if (email) {
          await sendNotice(
            email,
            'Your trial has ended',
            'Your trial period has ended. Please complete payment to continue using the service.',
          )
          noticesSent += 1
        }
        continue
      }
      if (subscription.currentPeriodEnd > now) {
        if (email) {
          await sendNotice(
            email,
            'Payment failed',
            'Your current paid period is still active. Please complete payment before it ends.',
          )
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

      if (email) {
        await sendNotice(
          email,
          'Payment failed',
          'We could not charge your card. Please update your payment method.',
        )
        noticesSent += 1
      }
      continue
    }

    if (!subscription.graceEndsAt) {
      continue
    }

    const remainingDays = wholeDaysUntil(subscription.graceEndsAt, now)
    if (remainingDays < 0) {
      await disable(subscription.id, 'grace_period_expired')
      movedToDisabled += 1
      if (email) {
        await sendNotice(
          email,
          'Your account has been disabled',
          'Your grace period has ended.',
        )
        noticesSent += 1
      }
      continue
    }

    if (email && GRACE_NOTICE_DAYS.includes(remainingDays as 7 | 3 | 1)) {
      await sendNotice(
        email,
        `Action required: ${remainingDays} day(s) until suspension`,
        `Your account will be disabled in ${remainingDays} day(s). Please update your payment method.`,
      )
      noticesSent += 1
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
