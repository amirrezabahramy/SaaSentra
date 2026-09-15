import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'

/**
 * Cross-origin entitlement endpoint.
 *
 * NOTE: this must be a server ROUTE (not a server function) so that external
 * services can call it cross-origin. Server functions are meant for the app's
 * own client, not third-party callers.
 */
export const Route = createFileRoute('/api/v1/entitlements/$tenantId')({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request
        params: { tenantId: string }
      }) => {
        const secret = request.headers.get('x-service-secret')
        if (
          !process.env.SERVICE_SECRET ||
          secret !== process.env.SERVICE_SECRET
        ) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const tenant = await db.tenant.findUnique({
          where: { id: params.tenantId, deletedAt: null },
          include: {
            subscription: { include: { plan: true } },
            flags: { include: { flag: true } },
          },
        })

        if (!tenant) {
          return Response.json({ error: 'Tenant not found' }, { status: 404 })
        }

        const status = tenant.subscription?.status
        const active = status === 'ACTIVE' || status === 'TRIALING'

        return Response.json({
          active,
          plan: tenant.subscription?.plan?.slug ?? null,
          flags: tenant.flags
            .filter((tf) => tf.enabled)
            .map((tf) => tf.flag.key),
          periodEnd: tenant.subscription?.currentPeriodEnd ?? null,
        })
      },
    },
  },
})
