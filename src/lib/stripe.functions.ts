import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from '#/db'
import { auth } from './auth'
import { stripeRequest, stringValue } from './stripe'

const checkoutSchema = z.object({ tenantId: z.string().uuid(), planId: z.string().uuid() })

export const createCheckoutSession = createServerFn({ method: 'POST' })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session?.user?.id) throw new Error('Authentication required')

    const [tenant, plan] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: data.tenantId }, include: { subscription: true } }),
      db.plan.findUniqueOrThrow({ where: { id: data.planId } }),
    ])
    if (!plan.stripePriceId) throw new Error('Plan has no Stripe price ID')

    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': plan.stripePriceId,
      'line_items[0][quantity]': '1',
      success_url: `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/?checkout=success`,
      cancel_url: `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/?checkout=canceled`,
      'metadata[tenantId]': tenant.id,
      'metadata[planId]': plan.id,
      'subscription_data[metadata][tenantId]': tenant.id,
      'subscription_data[metadata][planId]': plan.id,
    })
    if (tenant.subscription) params.set('metadata[subscriptionId]', tenant.subscription.id)
    if (tenant.subscription) params.set('subscription_data[metadata][subscriptionId]', tenant.subscription.id)

    const checkout = await stripeRequest<{ id?: unknown; url?: unknown }>('/checkout/sessions', params)
    const sessionId = stringValue(checkout.id)
    if (!sessionId) throw new Error('Stripe did not return a checkout session ID')
    if (tenant.subscription) {
      await db.subscription.update({ where: { id: tenant.subscription.id }, data: { stripeSubscriptionId: `checkout_session:${sessionId}` } })
    }
    return { id: sessionId, url: stringValue(checkout.url) }
  })
