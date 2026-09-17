import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/env'
import { db } from '#/db'

export const Route = createFileRoute('/api/v1/payments/checkouts/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (request.headers.get('x-service-secret') !== env.SERVICE_SECRET)
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const checkout = await db.paymentCheckout.findUnique({
          where: { id: params.id },
          include: { plan: true, subscription: true },
        })
        if (!checkout)
          return Response.json({ error: 'Checkout not found' }, { status: 404 })
        if (checkout.status === 'PENDING' && checkout.expiresAt < new Date()) {
          await db.paymentCheckout.update({
            where: { id: checkout.id },
            data: { status: 'EXPIRED' },
          })
          checkout.status = 'EXPIRED'
        }
        return Response.json({
          checkoutId: checkout.id,
          status: checkout.status,
          provider: checkout.provider,
          plan: checkout.plan.slug,
          subscription: checkout.subscription
            ? {
                id: checkout.subscription.id,
                status: checkout.subscription.status,
                serialKey: checkout.subscription.serialKey,
                periodEnd: checkout.plan.isPermanent
                  ? null
                  : checkout.subscription.currentPeriodEnd.toISOString(),
              }
            : null,
        })
      },
    },
  },
})
