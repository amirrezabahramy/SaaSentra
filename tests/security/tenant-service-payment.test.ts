import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import db from '#/db'
import { deliverCheckoutCallback } from '#/lib/payments/headless'

const originalFetch = globalThis.fetch

test('payment delivery uses the configuration of each tenant-service assignment', async () => {
  const tenantAId = randomUUID()
  const tenantBId = randomUUID()
  const serviceId = randomUUID()
  const subscriptionAId = randomUUID()
  const subscriptionBId = randomUUID()
  const checkoutAId = randomUUID()
  const checkoutBId = randomUUID()
  const plan = await db.plan.findFirstOrThrow({ where: { deletedAt: null } })
  const now = new Date()
  const requests: Array<{ url: string; secret: string }> = []

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      secret: new Headers(init?.headers).get('x-saas-signature') ?? '',
    })
    return new Response(null, { status: 204 })
  }

  try {
    await db.tenant.createMany({
      data: [
        {
          id: tenantAId,
          name: 'Payment isolation tenant A',
          slug: `payment-isolation-a-${tenantAId}`,
        },
        {
          id: tenantBId,
          name: 'Payment isolation tenant B',
          slug: `payment-isolation-b-${tenantBId}`,
        },
      ],
    })
    await db.service.create({
      data: { id: serviceId, name: 'Payment isolation service' },
    })
    await db.tenantService.createMany({
      data: [
        {
          tenantId: tenantAId,
          serviceId,
          paymentCallbackUrl: 'https://example.com/tenant-a/callback',
          paymentCallbackSecret: 'secret-a',
        },
        {
          tenantId: tenantBId,
          serviceId,
          paymentCallbackUrl: 'https://example.com/tenant-b/callback',
          paymentCallbackSecret: 'secret-b',
        },
      ],
    })
    await db.subscription.createMany({
      data: [
        {
          id: subscriptionAId,
          tenantId: tenantAId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 86_400_000),
        },
        {
          id: subscriptionBId,
          tenantId: tenantBId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 86_400_000),
        },
      ],
    })
    await db.paymentCheckout.createMany({
      data: [
        {
          id: checkoutAId,
          tenantId: tenantAId,
          serviceId,
          subscriptionId: subscriptionAId,
          planId: plan.id,
          provider: plan.provider,
          status: 'SUCCEEDED',
          expiresAt: new Date(now.getTime() + 86_400_000),
        },
        {
          id: checkoutBId,
          tenantId: tenantBId,
          serviceId,
          subscriptionId: subscriptionBId,
          planId: plan.id,
          provider: plan.provider,
          status: 'SUCCEEDED',
          expiresAt: new Date(now.getTime() + 86_400_000),
        },
      ],
    })

    const deliveryA = await deliverCheckoutCallback(checkoutAId)
    const deliveryB = await deliverCheckoutCallback(checkoutBId)

    assert.equal(deliveryA.status, 'SUCCEEDED')
    assert.equal(deliveryB.status, 'SUCCEEDED')
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        'https://example.com/tenant-a/callback',
        'https://example.com/tenant-b/callback',
      ],
    )
    assert.notEqual(requests[0]?.secret, requests[1]?.secret)
  } finally {
    globalThis.fetch = originalFetch
    await db.paymentCheckout.deleteMany({
      where: { id: { in: [checkoutAId, checkoutBId] } },
    })
    await db.subscription.deleteMany({
      where: { id: { in: [subscriptionAId, subscriptionBId] } },
    })
    await db.service.delete({ where: { id: serviceId } })
    await db.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    })
  }
})
