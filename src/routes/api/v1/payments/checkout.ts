import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { env } from '#/env'
import { db } from '#/db'
import { resolvePaymentProvider } from '#/lib/payments/resolver'
import { assertMatchingExternalOrigin } from '#/lib/external-url'
import { consumeRateLimit } from '#/lib/rate-limit'
import { authenticateServiceRequest } from '#/lib/service-credentials'

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
        const body = await request.json().catch(() => null)
        const parsed = checkoutSchema.safeParse(body)
        if (!parsed.success)
          return Response.json(
            { error: 'Invalid checkout request' },
            { status: 400 },
          )

        const { tenantId, serviceId, planId, returnUrl } = parsed.data
        if (!(await authenticateServiceRequest(request, serviceId)))
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (
          !consumeRateLimit(`checkout:${serviceId}`, {
            limit: 20,
            windowMs: 60_000,
          })
        ) {
          return Response.json({ error: 'Too many requests' }, { status: 429 })
        }
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
        if (returnUrl && !service.paymentCallbackUrl) {
          return Response.json(
            { error: 'This service does not allow an external return URL' },
            { status: 400 },
          )
        }
        let safeReturnUrl: URL | undefined
        try {
          safeReturnUrl =
            returnUrl && service.paymentCallbackUrl
              ? await assertMatchingExternalOrigin(
                  returnUrl,
                  service.paymentCallbackUrl,
                )
              : undefined
        } catch {
          return Response.json({ error: 'Invalid return URL' }, { status: 400 })
        }
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
        if (plan.provider === 'STRIPE' && !plan.providerPriceId)
          return Response.json(
            { error: 'Stripe plans require a provider price ID' },
            { status: 400 },
          )
        if (
          tenant.subscription?.deletedAt ||
          tenant.subscription?.status === 'ARCHIVED'
        )
          return Response.json(
            { error: 'Archived subscriptions cannot be paid' },
            { status: 409 },
          )
        if (
          tenant.subscription?.status === 'DISABLED' &&
          tenant.subscription.currentPeriodEnd > new Date()
        ) {
          return Response.json(
            {
              error:
                'This subscription cannot be reactivated before its period ends',
            },
            { status: 409 },
          )
        }
        if (
          tenant.subscription &&
          ['CANCELED', 'ARCHIVED'].includes(tenant.subscription.status)
        ) {
          return Response.json(
            {
              error: 'This subscription cannot be reactivated through payment',
            },
            { status: 409 },
          )
        }
        if (
          tenant.subscription?.status === 'DISABLED_AT_PERIOD_END' &&
          tenant.subscription.currentPeriodEnd > new Date()
        ) {
          return Response.json(
            {
              error:
                'This subscription cannot be reactivated before its period ends',
            },
            { status: 409 },
          )
        }

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
            returnUrl: safeReturnUrl?.toString(),
            expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
          },
        })
        const paymentReturnUrl = (status: 'success' | 'canceled') => {
          if (!safeReturnUrl)
            return `${baseUrl()}/api/v1/payments/checkouts/${checkout.id}`
          const url = new URL(safeReturnUrl)
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
            planType: plan.type,
            isPermanent: plan.isPermanent,
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
          console.error('[payments] checkout creation failed', {
            provider: plan.provider,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          await db.paymentCheckout.update({
            where: { id: checkout.id },
            data: { status: 'CANCELED' },
          })
          return Response.json(
            {
              error: 'Could not create checkout',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
