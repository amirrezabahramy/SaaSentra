import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/env'
import { db } from '#/db'
import { resolvePaymentProvider } from '#/lib/payments/resolver'
import { settleVerifiedPayment } from '#/lib/payments/orchestrator'
import { deliverPaymentCallback } from '#/lib/payments/headless'

function redirectToCheckout(
  status: 'success' | 'canceled',
  paymentId?: string,
  returnUrl?: string | null,
) {
  const url = new URL(returnUrl ?? env.BETTER_AUTH_URL)
  url.searchParams.set('checkout', status)
  url.searchParams.set('provider', 'zibal')
  if (paymentId) url.searchParams.set('paymentId', paymentId)
  return Response.redirect(url)
}

export const Route = createFileRoute('/api/payments/zibal/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const trackId = url.searchParams.get('trackId')
        const success = url.searchParams.get('success')
        if (!trackId || success !== '1') return redirectToCheckout('canceled')

        const existingPayment = await db.payment.findUnique({
          where: { id: `zibal:${trackId}` },
        })
        if (existingPayment?.status === 'SUCCEEDED')
          return redirectToCheckout('success', trackId)

        const checkout = await db.paymentCheckout.findFirst({
          where: { providerPaymentId: trackId, status: 'PENDING' },
          include: { plan: true, service: true, subscription: true },
        })
        if (!checkout) {
          const legacy = await db.subscription.findFirst({
            where: {
              providerSubscriptionId: `zibal_checkout_session:${trackId}`,
              deletedAt: null,
            },
            include: { plan: true },
          })
          if (!legacy || legacy.plan.provider !== 'ZIBAL')
            return redirectToCheckout('canceled', trackId)
          try {
            const verified = await resolvePaymentProvider(
              'ZIBAL',
            ).verifyPayment({
              paymentId: trackId,
              amountMinor: legacy.plan.priceMinor,
              currency: legacy.plan.currency,
            })
            if (verified.status !== 'SUCCEEDED')
              return redirectToCheckout('canceled', trackId)
            await settleVerifiedPayment({
              provider: 'ZIBAL',
              subscriptionId: legacy.id,
              verified,
            })
            return redirectToCheckout('success', trackId)
          } catch {
            return redirectToCheckout('canceled', trackId)
          }
        }
        if (!checkout.subscription || checkout.plan.provider !== 'ZIBAL')
          return redirectToCheckout('canceled', trackId)

        try {
          const verified = await resolvePaymentProvider('ZIBAL').verifyPayment({
            paymentId: trackId,
            amountMinor: checkout.plan.priceMinor,
            currency: checkout.plan.currency,
          })
          if (verified.status !== 'SUCCEEDED')
            return redirectToCheckout('canceled', trackId)
          await settleVerifiedPayment({
            provider: 'ZIBAL',
            subscriptionId: checkout.subscription.id,
            verified,
            checkoutId: checkout.id,
          })
          const settled = await db.paymentCheckout.findUniqueOrThrow({
            where: { id: checkout.id },
            include: {
              subscription: { include: { plan: true } },
              service: true,
            },
          })
          await deliverPaymentCallback({
            url: settled.service.paymentCallbackUrl,
            secret: settled.service.paymentCallbackSecret,
            payload: {
              event: 'payment.succeeded',
              checkoutId: settled.id,
              tenantId: settled.tenantId,
              subscriptionId: settled.subscription?.id,
              plan: settled.subscription?.plan.slug,
              serialKey: settled.subscription?.serialKey,
              periodEnd: settled.subscription?.plan.isPermanent
                ? null
                : settled.subscription?.currentPeriodEnd.toISOString(),
              paymentId: trackId,
            },
          })
          return redirectToCheckout('success', trackId, settled.returnUrl)
        } catch {
          return redirectToCheckout('canceled', trackId)
        }
      },
    },
  },
})
