import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import db from '#/db'
import { getEntitlement } from '#/lib/lifecycle'
import { settleVerifiedPayment } from '#/lib/payments/orchestrator'
import {
  authenticateServiceRequest,
  generateServiceApiKey,
  hashServiceApiKey,
} from '#/lib/service-credentials'

function requestWithKey(apiKey: string): Request {
  return new Request('http://localhost/internal', {
    headers: { 'x-service-secret': apiKey },
  })
}

async function findPlan(type: 'SUBSCRIPTION' | 'SERIAL_KEY') {
  return db.plan.findFirstOrThrow({
    where: { type, deletedAt: null },
  })
}

test('service credentials cannot cross service boundaries or survive revocation', async () => {
  const tenantId = randomUUID()
  const serviceAId = randomUUID()
  const serviceBId = randomUUID()
  const apiKey = generateServiceApiKey()

  await db.tenant.create({
    data: {
      id: tenantId,
      name: 'Credential test tenant',
      slug: `credential-${tenantId}`,
    },
  })
  await db.service.createMany({
    data: [
      {
        id: serviceAId,
        name: 'Credential test service A',
      },
      {
        id: serviceBId,
        name: 'Credential test service B',
      },
    ],
  })
  await db.tenantService.createMany({
    data: [
      {
        tenantId,
        serviceId: serviceAId,
        serviceApiKeyHash: await hashServiceApiKey(apiKey),
      },
      {
        tenantId,
        serviceId: serviceBId,
        serviceApiKeyHash: await hashServiceApiKey(generateServiceApiKey()),
      },
    ],
  })

  try {
    assert.equal(
      await authenticateServiceRequest(requestWithKey(apiKey), {
        serviceId: serviceAId,
        tenantId,
      }),
      true,
    )
    assert.equal(
      await authenticateServiceRequest(requestWithKey(apiKey), {
        serviceId: serviceBId,
        tenantId,
      }),
      false,
    )

    await db.tenantService.update({
      where: { tenantId_serviceId: { tenantId, serviceId: serviceAId } },
      data: { serviceApiKeyRevokedAt: new Date() },
    })
    assert.equal(
      await authenticateServiceRequest(requestWithKey(apiKey), {
        serviceId: serviceAId,
        tenantId,
      }),
      false,
    )
  } finally {
    await db.service.deleteMany({
      where: { id: { in: [serviceAId, serviceBId] } },
    })
    await db.tenant.delete({ where: { id: tenantId } })
  }
})

test('archived tenant and subscription entitlements are inactive and cross-service access is rejected', async () => {
  const tenantId = randomUUID()
  const otherTenantId = randomUUID()
  const serviceId = randomUUID()
  const otherServiceId = randomUUID()
  const subscriptionId = randomUUID()
  const plan = await findPlan('SUBSCRIPTION')
  const now = new Date()

  await db.tenant.createMany({
    data: [
      {
        id: tenantId,
        name: 'Archive test tenant',
        slug: `archive-${tenantId}`,
      },
      {
        id: otherTenantId,
        name: 'Other test tenant',
        slug: `other-${otherTenantId}`,
      },
    ],
  })
  await db.service.createMany({
    data: [
      { id: serviceId, name: 'Archive test service' },
      {
        id: otherServiceId,
        name: 'Other test service',
      },
    ],
  })
  await db.tenantService.createMany({
    data: [
      { tenantId, serviceId },
      { tenantId: otherTenantId, serviceId: otherServiceId },
    ],
  })
  await db.subscription.create({
    data: {
      id: subscriptionId,
      tenantId,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 86_400_000),
    },
  })

  try {
    const active = await getEntitlement(tenantId, { serviceId })
    assert.equal(active.active, true)
    await assert.rejects(() =>
      getEntitlement(tenantId, { serviceId: otherServiceId }),
    )

    await db.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ARCHIVED' },
    })
    const archivedSubscription = await getEntitlement(tenantId, { serviceId })
    assert.equal(archivedSubscription.active, false)
    assert.equal(archivedSubscription.reason, 'NO_SUBSCRIPTION')

    await db.tenant.update({
      where: { id: tenantId },
      data: { deletedAt: new Date() },
    })
    const archivedTenant = await getEntitlement(tenantId, { serviceId })
    assert.equal(archivedTenant.active, false)
    assert.equal(archivedTenant.reason, 'NO_SUBSCRIPTION')
  } finally {
    await db.auditLog.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    })
    await db.subscription.delete({ where: { id: subscriptionId } })
    await db.service.deleteMany({
      where: { id: { in: [serviceId, otherServiceId] } },
    })
    await db.tenant.deleteMany({
      where: { id: { in: [tenantId, otherTenantId] } },
    })
  }
})

test('serial-key entitlement persists submission state without returning the secret', async () => {
  const tenantId = randomUUID()
  const subscriptionId = randomUUID()
  const plan = await findPlan('SERIAL_KEY')
  const serialKey = `SK-TEST-${randomUUID()}`
  const now = new Date()

  await db.tenant.create({
    data: {
      id: tenantId,
      name: 'Serial test tenant',
      slug: `serial-${tenantId}`,
    },
  })
  await db.subscription.create({
    data: {
      id: subscriptionId,
      tenantId,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 86_400_000),
      serialKey,
    },
  })

  try {
    const wrong = await getEntitlement(tenantId, {
      validateSerialKey: true,
      serialKey: 'SK-WRONG',
    })
    assert.equal(wrong.active, false)
    assert.equal(wrong.serialKeyMatches, false)
    assert.equal('serialKey' in wrong, false)

    const correct = await getEntitlement(tenantId, {
      validateSerialKey: true,
      serialKey,
    })
    assert.equal(correct.active, true)
    assert.equal(correct.serialKeyMatches, true)

    await db.subscription.update({
      where: { id: subscriptionId },
      data: { submittedSerialKey: serialKey },
    })
    const persisted = await getEntitlement(tenantId, {
      validateSerialKey: true,
    })
    assert.equal(persisted.active, true)
    assert.equal(persisted.serialKeySubmitted, true)
    assert.equal('serialKey' in persisted, false)
  } finally {
    await db.subscription.delete({ where: { id: subscriptionId } })
    await db.tenant.delete({ where: { id: tenantId } })
  }
})

test('payment settlement rejects archived subscriptions and mismatched amounts', async () => {
  const tenantId = randomUUID()
  const subscriptionId = randomUUID()
  const plan = await findPlan('SUBSCRIPTION')
  const now = new Date()

  await db.tenant.create({
    data: {
      id: tenantId,
      name: 'Settlement test tenant',
      slug: `settlement-${tenantId}`,
    },
  })
  await db.subscription.create({
    data: {
      id: subscriptionId,
      tenantId,
      planId: plan.id,
      status: 'ARCHIVED',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 86_400_000),
    },
  })

  try {
    await assert.rejects(
      () =>
        settleVerifiedPayment({
          provider: 'STRIPE',
          subscriptionId,
          verified: {
            providerPaymentId: `archived-${tenantId}`,
            status: 'SUCCEEDED',
            amountMinor: plan.priceMinor,
            currency: plan.currency,
          },
        }),
      /Archived subscriptions cannot receive payments/,
    )

    await db.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' },
    })
    await assert.rejects(
      () =>
        settleVerifiedPayment({
          provider: 'STRIPE',
          subscriptionId,
          verified: {
            providerPaymentId: `mismatch-${tenantId}`,
            status: 'SUCCEEDED',
            amountMinor: plan.priceMinor + 1,
            currency: plan.currency,
          },
        }),
      /Payment amount does not match the plan price/,
    )
    assert.equal(await db.payment.count({ where: { tenantId } }), 0)
    assert.equal(await db.invoice.count({ where: { tenantId } }), 0)
  } finally {
    await db.subscription.delete({ where: { id: subscriptionId } })
    await db.tenant.delete({ where: { id: tenantId } })
  }
})
