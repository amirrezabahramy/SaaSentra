import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/env'
import { db } from '#/db'
import { resolvePaymentProvider } from '#/lib/payments/resolver'
import { settleVerifiedPayment } from '#/lib/payments/orchestrator'

function redirectToCheckout(
  status: 'success' | 'canceled',
  paymentId?: string,
) {
  const url = new URL(env.BETTER_AUTH_URL)
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

        const subscription = await db.subscription.findFirst({
          where: {
            providerSubscriptionId: `zibal_checkout_session:${trackId}`,
            deletedAt: null,
          },
          include: { plan: true },
        })
        if (!subscription || subscription.plan.provider !== 'ZIBAL')
          return redirectToCheckout('canceled', trackId)

        try {
          const verified = await resolvePaymentProvider('ZIBAL').verifyPayment({
            paymentId: trackId,
            amountMinor: subscription.plan.priceMinor,
            currency: subscription.plan.currency,
          })
          if (verified.status !== 'SUCCEEDED')
            return redirectToCheckout('canceled', trackId)
          await settleVerifiedPayment({
            provider: 'ZIBAL',
            subscriptionId: subscription.id,
            verified,
          })
          return redirectToCheckout('success', trackId)
        } catch {
          return redirectToCheckout('canceled', trackId)
        }
      },
    },
  },
})
