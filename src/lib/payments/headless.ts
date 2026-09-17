import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '#/db'

export function signPaymentEvent(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function signaturesMatch(expected: string, actual: string) {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function deliverPaymentCallback(input: {
  url: string | null
  secret: string | null
  payload: Record<string, unknown>
}) {
  if (!input.url || !input.secret) return { delivered: false, skipped: true }
  const body = JSON.stringify(input.payload)
  const signature = signPaymentEvent(input.secret, body)
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-saas-event': 'payment.succeeded',
      'x-saas-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok)
    throw new Error(`Payment callback failed: ${response.status}`)
  return { delivered: true, skipped: false }
}

export async function deliverCheckoutCallback(checkoutId: string) {
  const checkout = await db.paymentCheckout.findUniqueOrThrow({
    where: { id: checkoutId },
    include: { service: true, subscription: { include: { plan: true } } },
  })
  const delivery = await db.paymentDelivery.upsert({
    where: { checkoutId },
    create: { checkoutId },
    update: {},
  })
  if (delivery.status === 'SUCCEEDED') return delivery
  if (
    !checkout.service.paymentCallbackUrl ||
    !checkout.service.paymentCallbackSecret
  ) {
    return db.paymentDelivery.update({
      where: { checkoutId },
      data: { status: 'NOT_CONFIGURED', attempts: { increment: 1 } },
    })
  }
  const payload = {
    event: 'payment.succeeded',
    checkoutId: checkout.id,
    tenantId: checkout.tenantId,
    subscriptionId: checkout.subscription?.id,
    plan: checkout.subscription?.plan.slug,
    serialKey: checkout.subscription?.serialKey,
    periodEnd: checkout.subscription?.plan.isPermanent
      ? null
      : checkout.subscription?.currentPeriodEnd.toISOString(),
    paymentId: checkout.providerPaymentId,
  }
  try {
    await deliverPaymentCallback({
      url: checkout.service.paymentCallbackUrl,
      secret: checkout.service.paymentCallbackSecret,
      payload,
    })
    return db.paymentDelivery.update({
      where: { checkoutId },
      data: {
        status: 'SUCCEEDED',
        attempts: { increment: 1 },
        lastError: null,
        deliveredAt: new Date(),
      },
    })
  } catch (error) {
    return db.paymentDelivery.update({
      where: { checkoutId },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastError: error instanceof Error ? error.message : 'Callback failed',
      },
    })
  }
}
