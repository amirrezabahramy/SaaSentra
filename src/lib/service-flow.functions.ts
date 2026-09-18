import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { env } from '#/env'
import { getEntitlement } from '#/lib/lifecycle'

const serviceInput = z.object({
  tenantId: z.string().uuid(),
  serviceId: z.string().uuid(),
})

const serialKeyInput = serviceInput.extend({
  serialKey: z.string().trim().min(1).max(200),
})

const checkoutInput = serviceInput

const checkoutResultInput = z.object({ checkoutId: z.string().uuid() })

async function readServiceCheck(input: z.infer<typeof serviceInput>) {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId, deletedAt: null },
    include: {
      subscription: { include: { plan: true } },
    },
  })
  const service = await db.service.findUnique({
    where: { id: input.serviceId, deletedAt: null },
  })
  if (!tenant || !service || service.tenantId !== tenant.id) {
    throw new Error('Service or tenant not found')
  }
  if (!tenant.subscription || tenant.subscription.deletedAt) {
    return {
      tenant: { id: tenant.id, name: tenant.name },
      service: { id: service.id, name: service.name },
      subscription: null,
      entitlement: null,
      canPay: false,
      canSubmitSerialKey: false,
    }
  }

  const subscription = tenant.subscription
  const now = new Date()
  const canPay =
    (subscription.status === 'DISABLED' &&
      subscription.currentPeriodEnd <= now) ||
    subscription.status === 'GRACE_PERIOD' ||
    subscription.status === 'PAST_DUE'
  const canSubmitSerialKey =
    subscription.plan.type === 'SERIAL_KEY' &&
    !['CANCELED', 'DISABLED_AT_PERIOD_END', 'ARCHIVED'].includes(
      subscription.status,
    )

  return {
    tenant: { id: tenant.id, name: tenant.name },
    service: { id: service.id, name: service.name },
    subscription: {
      id: subscription.id,
      status: subscription.status,
      planId: subscription.planId,
      planName: subscription.plan.name,
      planType: subscription.plan.type,
      provider: subscription.plan.provider,
      currency: subscription.plan.currency,
      priceMinor: subscription.plan.priceMinor,
      periodEnd: subscription.plan.isPermanent
        ? null
        : subscription.currentPeriodEnd.toISOString(),
      serialKey: subscription.serialKey,
      submittedSerialKey: subscription.submittedSerialKey,
    },
    entitlement: await getEntitlement(input.tenantId, {
      validateSerialKey: true,
      serviceId: input.serviceId,
    }),
    canPay,
    canSubmitSerialKey,
  }
}

export const getServiceCheck = createServerFn({ method: 'GET' })
  .validator((data: unknown) => serviceInput.parse(data))
  .handler(({ data }) => readServiceCheck(data))

export const submitServiceSerialKey = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serialKeyInput.parse(data))
  .handler(async ({ data }) => {
    const tenant = await db.tenant.findUnique({
      where: { id: data.tenantId, deletedAt: null },
      include: { subscription: { include: { plan: true } } },
    })
    const service = await db.service.findUnique({
      where: { id: data.serviceId, deletedAt: null },
      select: { tenantId: true },
    })
    if (!tenant || !service || service.tenantId !== tenant.id) {
      throw new Error('Service or tenant not found')
    }
    if (
      !tenant.subscription ||
      tenant.subscription.plan.type !== 'SERIAL_KEY'
    ) {
      throw new Error('This subscription does not use a serial key')
    }
    if (tenant.subscription.serialKey !== data.serialKey) {
      throw new Error('Invalid serial key')
    }
    await db.subscription.update({
      where: { id: tenant.subscription.id, deletedAt: null },
      data: { submittedSerialKey: data.serialKey },
    })
    return readServiceCheck(data)
  })

export const startServiceCheckout = createServerFn({ method: 'POST' })
  .validator((data: unknown) => checkoutInput.parse(data))
  .handler(async ({ data }) => {
    const serviceCheck = await readServiceCheck(data)
    if (!serviceCheck.subscription) throw new Error('No subscription found')
    if (!serviceCheck.canPay) {
      throw new Error('Payment is not available for this subscription')
    }
    const response = await fetch(
      new URL('/api/v1/payments/checkout', env.BETTER_AUTH_URL),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-secret': env.SERVICE_SECRET,
        },
        body: JSON.stringify({
          tenantId: data.tenantId,
          serviceId: data.serviceId,
          planId: serviceCheck.subscription.planId,
          returnUrl: new URL('/payment-result', env.BETTER_AUTH_URL).toString(),
        }),
      },
    )
    const result: unknown = await response.json()
    if (!response.ok || !result || typeof result !== 'object') {
      throw new Error('Could not start payment')
    }
    const payment = result as { url?: unknown }
    if (typeof payment.url !== 'string') throw new Error('Payment URL missing')
    return { url: payment.url }
  })

export const getCheckoutResult = createServerFn({ method: 'GET' })
  .validator((data: unknown) => checkoutResultInput.parse(data))
  .handler(async ({ data }) => {
    const checkout = await db.paymentCheckout.findUnique({
      where: { id: data.checkoutId },
      include: { plan: true, subscription: true },
    })
    if (!checkout) throw new Error('Checkout not found')
    if (checkout.status === 'PENDING' && checkout.expiresAt < new Date()) {
      await db.paymentCheckout.update({
        where: { id: checkout.id },
        data: { status: 'EXPIRED' },
      })
      checkout.status = 'EXPIRED'
    }
    return {
      checkoutId: checkout.id,
      status: checkout.status,
      provider: checkout.provider,
      tenantId: checkout.tenantId,
      serviceId: checkout.serviceId,
      planName: checkout.plan.name,
      planType: checkout.plan.type,
      subscription: checkout.subscription
        ? {
            id: checkout.subscription.id,
            status: checkout.subscription.status,
            planType: checkout.plan.type,
            serialKey: checkout.subscription.serialKey,
            periodEnd: checkout.plan.isPermanent
              ? null
              : checkout.subscription.currentPeriodEnd.toISOString(),
          }
        : null,
    }
  })
