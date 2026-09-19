import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '#/db'
import { env } from '#/env'
import { getEntitlement } from '#/lib/lifecycle'
import { consumeRateLimit } from '#/lib/rate-limit'

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
        if (
          !consumeRateLimit(`entitlement:${params.tenantId}`, {
            limit: 120,
            windowMs: 60_000,
          })
        ) {
          return Response.json({ error: 'Too many requests' }, { status: 429 })
        }
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
      POST: async ({ request, params }) => {
        if (
          !consumeRateLimit(`entitlement-submit:${params.tenantId}`, {
            limit: 30,
            windowMs: 60_000,
          })
        ) {
          return Response.json({ error: 'Too many requests' }, { status: 429 })
        }
        if (
          request.headers.get('x-entitlement-secret') !==
          env.ENTITLEMENT_SHARED_SECRET
        ) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json().catch(() => null)
        const parsed = z
          .object({ serialKey: z.string().trim().min(1) })
          .safeParse(body)
        if (!parsed.success) {
          return Response.json(
            { error: 'Serial key is required' },
            { status: 400 },
          )
        }

        const serviceId = request.headers.get('x-service-id')
        const tenant = await db.tenant.findUnique({
          where: { id: params.tenantId, deletedAt: null },
          include: { subscription: { include: { plan: true } } },
        })
        if (
          !tenant ||
          !tenant.subscription ||
          tenant.subscription.deletedAt ||
          tenant.subscription.status === 'ARCHIVED'
        ) {
          return Response.json(
            { error: 'Tenant or subscription not found' },
            { status: 404 },
          )
        }
        if (serviceId) {
          const service = await db.service.findUnique({
            where: { id: serviceId, deletedAt: null },
            select: { tenantId: true },
          })
          if (!service || service.tenantId !== tenant.id) {
            return Response.json(
              { error: 'Service not found' },
              { status: 404 },
            )
          }
        }
        if (tenant.subscription.plan.type !== 'SERIAL_KEY') {
          return Response.json(
            { error: 'This subscription does not use serial keys' },
            { status: 409 },
          )
        }
        if (tenant.subscription.serialKey !== parsed.data.serialKey) {
          return Response.json({ error: 'Invalid serial key' }, { status: 422 })
        }

        await db.subscription.update({
          where: { id: tenant.subscription.id },
          data: { submittedSerialKey: parsed.data.serialKey },
        })
        return Response.json(
          await getEntitlement(params.tenantId, {
            validateSerialKey: true,
            serialKey: parsed.data.serialKey,
            serviceId: serviceId ?? undefined,
          }),
        )
      },
    },
  },
})
