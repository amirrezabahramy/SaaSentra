import { db } from '#/db'
import { env } from '#/env'
import { isEmailConfigured } from '#/lib/email'

export type ProductionCheck = {
  name: string
  ok: boolean
  message: string
}

function isPlaceholder(value: string): boolean {
  return /replace|example|change[-_ ]?me|your[-_ ]|_xxx$/i.test(value)
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && !/localhost|127\.0\.0\.1/i.test(url.hostname)
    )
  } catch {
    return false
  }
}

export async function getProductionReadiness() {
  const checks: ProductionCheck[] = []
  const authSecret = env.BETTER_AUTH_SECRET
  const entitlementSecret = env.ENTITLEMENT_SHARED_SECRET

  checks.push({
    name: 'better-auth-url',
    ok: isPublicHttpsUrl(env.BETTER_AUTH_URL),
    message: 'BETTER_AUTH_URL must be a public HTTPS URL.',
  })
  checks.push({
    name: 'better-auth-secret',
    ok: authSecret.length >= 32 && !isPlaceholder(authSecret),
    message:
      'BETTER_AUTH_SECRET must be a non-placeholder secret of at least 32 characters.',
  })
  checks.push({
    name: 'entitlement-secret',
    ok: entitlementSecret.length >= 32 && !isPlaceholder(entitlementSecret),
    message:
      'ENTITLEMENT_SHARED_SECRET must be a non-placeholder secret of at least 32 characters.',
  })
  checks.push({
    name: 'dunning-scheduler',
    ok: env.DUNNING_SCHEDULER_ENABLED !== 'false',
    message:
      'Enable the scheduler on exactly one production worker or use an external job runner.',
  })

  let databaseAvailable = false
  try {
    await db.$queryRaw`SELECT 1`
    databaseAvailable = true
    checks.push({
      name: 'database',
      ok: true,
      message: 'Database connection is available.',
    })
  } catch {
    checks.push({
      name: 'database',
      ok: false,
      message: 'Database connection is unavailable.',
    })
  }

  if (!databaseAvailable) {
    return {
      ready: checks.every((check) => check.ok),
      checks,
    }
  }

  const [stripePlanCount, emailServiceCount] = await Promise.all([
    db.plan.count({ where: { provider: 'STRIPE', deletedAt: null } }),
    db.service.count({
      where: {
        deletedAt: null,
        paymentDeliveryMode: { in: ['EMAIL', 'CALLBACK_AND_EMAIL'] },
      },
    }),
  ])

  if (stripePlanCount > 0) {
    checks.push({
      name: 'stripe-live-configuration',
      ok:
        env.STRIPE_SECRET_KEY.startsWith('sk_live_') &&
        env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_') &&
        !isPlaceholder(env.STRIPE_SECRET_KEY) &&
        !isPlaceholder(env.STRIPE_WEBHOOK_SECRET),
      message: 'Active Stripe plans require live API and webhook secrets.',
    })
  }

  if (emailServiceCount > 0) {
    checks.push({
      name: 'smtp-configuration',
      ok: isEmailConfigured(),
      message: 'Email delivery modes require complete SMTP configuration.',
    })
  }

  return {
    ready: checks.every((check) => check.ok),
    checks,
  }
}
