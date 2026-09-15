import cron from "node-cron";
import { db } from "./db";
import { GRACE_NOTICE_DAYS, disable } from "./lifecycle";

/**
 * Dunning / grace-period emails.
 * Replace with your real mailer (Resend, Postmark, SES, ...).
 */
async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // TODO: integrate a real email provider.
  console.log(`[dunning] email to=${to} subject="${subject}" body="${body}"`);
}

/**
 * Number of whole days remaining until graceEndsAt (rounded down).
 */
function daysUntil(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / 86_400_000);
}

/**
 * Scan PAST_DUE and GRACE_PERIOD subscriptions:
 *  - send grace notices at T-7, T-3, T-1 (GRACE_NOTICE_DAYS)
 *  - auto-disable subscriptions whose graceEndsAt has passed
 */
export async function runDunningScan(): Promise<void> {
  const subs = await db.subscription.findMany({
    where: {
      status: { in: ["PAST_DUE", "GRACE_PERIOD"] },
      deletedAt: null,
    },
    include: { tenant: true },
  });

  for (const sub of subs) {
    const ownerMembership = await db.membership.findFirst({
      where: { tenantId: sub.tenantId, role: "OWNER", deletedAt: null },
      include: { user: true },
    });
    const email = ownerMembership?.user.email;

    if (sub.status === "GRACE_PERIOD" && sub.graceEndsAt) {
      const remaining = daysUntil(sub.graceEndsAt);

      if (remaining < 0) {
        // Grace period exhausted -> auto-disable.
        await disable(sub.id, "grace_period_expired");
        if (email) {
          await sendEmail(email, "Your account has been disabled", "Your grace period has ended.");
        }
        continue;
      }

      if (GRACE_NOTICE_DAYS.includes(remaining)) {
        if (email) {
          await sendEmail(
            email,
            `Action required: ${remaining} day(s) until suspension`,
            `Your account will be disabled in ${remaining} day(s). Please update your payment method.`
          );
        }
      }
    } else if (sub.status === "PAST_DUE") {
      // Move into a grace period so the countdown starts.
      if (email) {
        await sendEmail(email, "Payment failed", "We could not charge your card. Please update it.");
      }
    }
  }
}

/**
 * Daily at 09:00 UTC.
 */
export function startDunningJob(): cron.ScheduledTask {
  const task = cron.schedule("0 9 * * *", async () => {
    try {
      await runDunningScan();
    } catch (err) {
      console.error("[dunning] scan failed", err);
    }
  });
  return task;
}
