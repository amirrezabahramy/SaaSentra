import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/env'
import { db } from '#/db'
import { deliverCheckoutCallback } from '#/lib/payments/headless'

export const Route = createFileRoute('/api/v1/payments/checkouts/$id/deliver')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (request.headers.get('x-service-secret') !== env.SERVICE_SECRET)
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const checkout = await db.paymentCheckout.findUnique({
          where: { id: params.id },
          select: { id: true, status: true },
        })
        if (!checkout)
          return Response.json({ error: 'Checkout not found' }, { status: 404 })
        if (checkout.status !== 'SUCCEEDED')
          return Response.json(
            { error: 'Only successful checkouts can be delivered' },
            { status: 409 },
          )
        const delivery = await deliverCheckoutCallback(checkout.id)
        return Response.json({
          checkoutId: checkout.id,
          status: delivery.status,
          attempts: delivery.attempts,
          deliveredAt: delivery.deliveredAt,
          lastError: delivery.lastError,
        })
      },
    },
  },
})
