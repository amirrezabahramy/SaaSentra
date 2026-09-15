import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { db } from '../db'
import {
  GRACE_NOTICE_DAYS,
  disable,
  enterGracePeriod,
} from './lifecycle'

const PAST_DUE_GRACE_THRESHOLD_DAYS = 3
const GRACE_PERIOD_DAYS = 7
const DAY_MS = 86_400_000

async function sendNotice(
  email: string,
  subject: string,
  body: string,
): Promise<void> {
  // Placeholder for Resend/Postmark/SES integration in a later phase.
  console.log(`[dunning] email to=${email} subject="${subject}" body="${body}"`)
}

function wholeDaysUntil(date: Date, now: Date): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS)
}

/** Process overdue subscriptions and grace-period notices. */
export async function runDunning(now = new Date()): Promise<void> {
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ['PAST_DUE', 'GRACE_PERIOD'] },
      deletedAt: null,
    },
    include: {
      tenant: {
        include: {
          memberships: {
            where: { role: 'OWNER', deletedAt: null },
            include: { user: true },
            take: 1,
          },
        },
      },
    },
  })

  for (const subscription of subscriptions) {
    const email = subscription.tenant.memberships[0]?.user.email

    if (subscription.status === 'PAST_DUE') {
      const pastDueDays = wholeDaysUntil(subscription.updatedAt, now) * -1
      if (pastDueDays > PAST_DUE_GRACE_THRESHOLD_DAYS) {
        await enterGracePeriod(subscription.id, GRACE_PERIOD_DAYS, {
          reason: 'past_due_grace_threshold_reached',
        })
      }

      if (email) {
        await sendNotice(
          email,
          'Payment failed',
          'We could not charge your card. Please update your payment method.',
        )
      }
      continue
    }

    if (!subscription.graceEndsAt) {
      continue
    }

    const remainingDays = wholeDaysUntil(subscription.graceEndsAt, now)
    if (remainingDays < 0) {
      await disable(subscription.id, 'grace_period_expired')
      if (email) {
        await sendNotice(
          email,
          'Your account has been disabled',
          'Your grace period has ended.',
        )
      }
      continue
    }

    if (email && GRACE_NOTICE_DAYS.includes(remainingDays as 7 | 3 | 1)) {
      await sendNotice(
        email,
        `Action required: ${remainingDays} day(s) until suspension`,
        `Your account will be disabled in ${remainingDays} day(s). Please update your payment method.`,
      )
    }
  }
}

/** Backward-compatible name for callers from the scaffold. */
export const runDunningScan = runDunning

/** Daily at 09:00 UTC; phase 07 can wire this into its operational runner. */
export function startDunningJob(): ScheduledTask {
  return cron.schedule('0 9 * * *', async () => {
    try {
      await runDunning()
    } catch (error) {
      console.error('[dunning] scan failed', error)
    }
  })
}
