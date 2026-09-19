import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import { z } from 'zod'
import { deliverCheckoutCallback } from '#/lib/payments/headless'
import { authenticateServiceRequest } from '#/lib/service-credentials'

export const Route = createFileRoute('/api/v1/payments/checkouts/$id/deliver')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const serviceId = request.headers.get('x-service-id')
        if (!serviceId || !z.string().uuid().safeParse(serviceId).success) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const checkout = await db.paymentCheckout.findUnique({
          where: { id: params.id },
          select: { id: true, serviceId: true, tenantId: true, status: true },
        })
        if (!checkout || checkout.serviceId !== serviceId)
          return Response.json({ error: 'Checkout not found' }, { status: 404 })
        if (
          !(await authenticateServiceRequest(request, {
            serviceId,
            tenantId: checkout.tenantId,
          }))
        )
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
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
