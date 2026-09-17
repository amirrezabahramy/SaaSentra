import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from '#/db'
import { auth } from './auth'
import { resolvePaymentProvider } from './payments/resolver'

const checkoutSchema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
})

export const createCheckoutSession = createServerFn({ method: 'POST' })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session || !session.user.id) throw new Error('Authentication required')

    const [tenant, plan] = await Promise.all([
      db.tenant.findUniqueOrThrow({
        where: { id: data.tenantId },
        include: { subscription: true },
      }),
      db.plan.findUniqueOrThrow({ where: { id: data.planId } }),
    ])
    const checkout = await resolvePaymentProvider(plan.provider).createPayment({
      tenantId: tenant.id,
      planId: plan.id,
      providerPriceId: plan.providerPriceId ?? undefined,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      subscriptionId: tenant.subscription?.id,
      callbackUrl: `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/api/payments/zibal/callback`,
      successUrl: `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/?checkout=success`,
      cancelUrl: `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/?checkout=canceled`,
    })
    if (tenant.subscription) {
      await db.subscription.update({
        where: { id: tenant.subscription.id },
        data: {
          providerSubscriptionId: `${plan.provider.toLowerCase()}_checkout_session:${checkout.id}`,
        },
      })
    }
    return checkout
  })
