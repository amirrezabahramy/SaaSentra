import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '#/db'
import { env } from '#/env'

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
    include: {
      service: true,
      subscription: { include: { plan: true } },
      tenant: {
        include: {
          memberships: {
            where: { role: 'OWNER', deletedAt: null },
            include: { user: true },
            take: 1,
          },
        },
      },
    },
  })
  const delivery = await db.paymentDelivery.upsert({
    where: { checkoutId },
    create: { checkoutId },
    update: {},
  })
  if (delivery.status === 'SUCCEEDED') return delivery
  const mode = checkout.service.paymentDeliveryMode
  const wantsCallback = mode === 'CALLBACK' || mode === 'CALLBACK_AND_EMAIL'
  const wantsEmail = mode === 'EMAIL' || mode === 'CALLBACK_AND_EMAIL'
  if (
    (wantsCallback &&
      (!checkout.service.paymentCallbackUrl ||
        !checkout.service.paymentCallbackSecret)) ||
    (wantsEmail &&
      (!env.EMAIL_TRANSPORT_URL || !checkout.tenant.memberships[0]?.user.email))
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
    if (wantsCallback) {
      await deliverPaymentCallback({
        url: checkout.service.paymentCallbackUrl,
        secret: checkout.service.paymentCallbackSecret,
        payload,
      })
    }
    if (wantsEmail) {
      const response = await fetch(env.EMAIL_TRANSPORT_URL as string, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: checkout.tenant.memberships[0]?.user.email,
          subject: 'Payment completed',
          template: 'payment.succeeded',
          data: payload,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok)
        throw new Error(`Email delivery failed: ${response.status}`)
    }
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
