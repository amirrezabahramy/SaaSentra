import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/env'
import { getEntitlement } from '#/lib/lifecycle'

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
        const secret = request.headers.get('x-entitlement-secret')
        if (secret !== env.ENTITLEMENT_SHARED_SECRET) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          return Response.json(
            await getEntitlement(params.tenantId, {
              validateSerialKey: true,
              serialKey: request.headers.get('x-serial-key') ?? undefined,
              serviceId: request.headers.get('x-service-id') ?? undefined,
            }),
          )
        } catch {
          return Response.json({ error: 'Tenant not found' }, { status: 404 })
        }
      },
    },
  },
})
