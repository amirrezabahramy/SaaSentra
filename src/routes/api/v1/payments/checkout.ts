import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { env } from '#/env'
import { db } from '#/db'
import { resolvePaymentProvider } from '#/lib/payments/resolver'

const checkoutSchema = z.object({
  tenantId: z.string().uuid(),
  serviceId: z.string().uuid(),
  planId: z.string().uuid(),
  returnUrl: z.string().url().optional(),
})

const baseUrl = () => env.BETTER_AUTH_URL

export const Route = createFileRoute('/api/v1/payments/checkout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get('x-service-secret') !== env.SERVICE_SECRET)
          return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const parsed = checkoutSchema.safeParse(await request.json())
        if (!parsed.success)
          return Response.json(
            { error: 'Invalid checkout request' },
            { status: 400 },
          )

        const { tenantId, serviceId, planId, returnUrl } = parsed.data
        const [tenant, service, plan] = await Promise.all([
          db.tenant.findUnique({
            where: { id: tenantId, deletedAt: null },
            include: { subscription: true },
          }),
          db.service.findUnique({ where: { id: serviceId, deletedAt: null } }),
          db.plan.findUnique({ where: { id: planId, deletedAt: null } }),
        ])
        if (!tenant || !service || service.tenantId !== tenantId || !plan)
          return Response.json(
            { error: 'Checkout resource not found' },
            { status: 404 },
          )
        if (plan.provider === 'ZIBAL' && plan.currency !== 'IRR')
          return Response.json(
            { error: 'Zibal plans must use IRR currency' },
            { status: 400 },
          )
        if (plan.provider === 'STRIPE' && plan.currency !== 'USD')
          return Response.json(
            { error: 'Stripe plans must use USD currency' },
            { status: 400 },
          )
        if (tenant.subscription?.status === 'ARCHIVED')
          return Response.json(
            { error: 'Archived subscriptions cannot be paid' },
            { status: 409 },
          )

        const now = new Date()
        const subscription = tenant.subscription
          ? tenant.subscription
          : await db.subscription.create({
              data: {
                tenantId,
                planId,
                status: 'TRIALING',
                currentPeriodStart: now,
                currentPeriodEnd: now,
              },
            })
        const checkout = await db.paymentCheckout.create({
          data: {
            tenantId,
            serviceId,
            subscriptionId: subscription.id,
            planId,
            provider: plan.provider,
            returnUrl,
            expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
          },
        })
        const paymentReturnUrl = (status: 'success' | 'canceled') => {
          if (!returnUrl)
            return `${baseUrl()}/api/v1/payments/checkouts/${checkout.id}`
          const url = new URL(returnUrl)
          url.searchParams.set('checkout', status)
          url.searchParams.set('checkoutId', checkout.id)
          return url.toString()
        }
        try {
          const payment = await resolvePaymentProvider(
            plan.provider,
          ).createPayment({
            checkoutId: checkout.id,
            tenantId,
            planId,
            providerPriceId: plan.providerPriceId ?? undefined,
            amountMinor: plan.priceMinor,
            currency: plan.currency,
            subscriptionId: subscription.id,
            callbackUrl: `${baseUrl()}/api/payments/zibal/callback`,
            successUrl: paymentReturnUrl('success'),
            cancelUrl: paymentReturnUrl('canceled'),
          })
          await db.paymentCheckout.update({
            where: { id: checkout.id },
            data: { providerPaymentId: payment.id },
          })
          return Response.json({
            checkoutId: checkout.id,
            provider: plan.provider,
            plan: plan.slug,
            amountMinor: plan.priceMinor,
            currency: plan.currency,
            url: payment.url,
            expiresAt: checkout.expiresAt.toISOString(),
          })
        } catch (error) {
          await db.paymentCheckout.update({
            where: { id: checkout.id },
            data: { status: 'CANCELED' },
          })
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not create checkout',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
