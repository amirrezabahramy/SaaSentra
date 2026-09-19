import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import { z } from 'zod'
import { authenticateServiceRequest } from '#/lib/service-credentials'

export const Route = createFileRoute('/api/v1/payments/checkouts/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const serviceId = request.headers.get('x-service-id')
        if (!serviceId || !z.string().uuid().safeParse(serviceId).success) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const checkout = await db.paymentCheckout.findUnique({
          where: { id: params.id },
          include: { plan: true, service: true, subscription: true },
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
        const assignment = await db.tenantService.findUnique({
          where: {
            tenantId_serviceId: {
              tenantId: checkout.tenantId,
              serviceId,
            },
          },
        })
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
          planType: checkout.plan.type,
          tenantId: checkout.tenantId,
          serviceId: checkout.serviceId,
          subscription: checkout.subscription
            ? {
                id: checkout.subscription.id,
                status: checkout.subscription.status,
                serialKey:
                  assignment?.paymentDeliveryMode === 'EMAIL'
                    ? null
                    : checkout.subscription.serialKey,
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
