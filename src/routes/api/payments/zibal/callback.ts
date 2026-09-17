import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/env'
import { db } from '#/db'
import { resolvePaymentProvider } from '#/lib/payments/resolver'

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
          return redirectToCheckout(
            verified.status === 'SUCCEEDED' ? 'success' : 'canceled',
            trackId,
          )
        } catch {
          return redirectToCheckout('canceled', trackId)
        }
      },
    },
  },
})
