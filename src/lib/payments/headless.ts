import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '#/db'
import { isEmailConfigured, sendPaymentEmail } from '#/lib/email'
import { parseExternalUrl } from '#/lib/external-url'

export const MAX_CALLBACK_RESPONSE_BYTES = 64 * 1024
const MAX_CALLBACK_ATTEMPTS = 3
const CALLBACK_RETRY_DELAY_MS = 100

export function signPaymentEvent(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function signaturesMatch(expected: string, actual: string) {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function consumeResponse(response: Response): Promise<void> {
  const body = response.body
  if (body === null) return
  const reader = body.getReader()
  let bytes = 0
  try {
    let chunk = await reader.read()
    while (!chunk.done) {
      bytes += chunk.value.byteLength
      if (bytes > MAX_CALLBACK_RESPONSE_BYTES) {
        throw new Error('Payment callback response exceeded the size limit')
      }
      chunk = await reader.read()
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, CALLBACK_RETRY_DELAY_MS * 2 ** attempt)
  })
}

export async function deliverPaymentCallback(input: {
  url: string | null
  secret: string | null
  payload: Record<string, unknown>
}) {
  if (!input.url || !input.secret) return { delivered: false, skipped: true }
  const body = JSON.stringify(input.payload)
  const signature = signPaymentEvent(input.secret, body)
  for (let attempt = 0; attempt < MAX_CALLBACK_ATTEMPTS; attempt += 1) {
    const url = await parseExternalUrl(input.url)
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          'x-saas-event': 'payment.succeeded',
          'x-saas-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      await consumeResponse(response)
      if (response.ok) return { delivered: true, skipped: false }
      if (response.status < 500 || attempt === MAX_CALLBACK_ATTEMPTS - 1) {
        throw new Error(`Payment callback failed: ${response.status}`)
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Payment callback response exceeded the size limit'
      ) {
        throw error
      }
      if (attempt === MAX_CALLBACK_ATTEMPTS - 1) throw error
    }
    await waitForRetry(attempt)
  }
  throw new Error('Payment callback failed')
}

export async function deliverCheckoutCallback(checkoutId: string) {
  const checkout = await db.paymentCheckout.findUniqueOrThrow({
    where: { id: checkoutId },
    include: {
      service: true,
      subscription: { include: { plan: true } },
      tenant: true,
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
  const payload = {
    event: 'payment.succeeded',
    checkoutId: checkout.id,
    tenantId: checkout.tenantId,
    tenantName: checkout.tenant.name,
    subscriptionId: checkout.subscription?.id,
    plan: checkout.subscription?.plan.slug,
    planName: checkout.subscription?.plan.name,
    serialKey: checkout.subscription?.serialKey,
    periodEnd: checkout.subscription?.plan.isPermanent
      ? null
      : checkout.subscription?.currentPeriodEnd.toISOString(),
    paymentId: checkout.providerPaymentId,
  }
  try {
    const errors: string[] = []
    let deliveredCount = 0
    let emailQueued = false
    if (wantsCallback) {
      if (
        !checkout.service.paymentCallbackUrl ||
        !checkout.service.paymentCallbackSecret
      ) {
        errors.push('Payment callback is not configured')
      } else {
        try {
          await deliverPaymentCallback({
            url: checkout.service.paymentCallbackUrl,
            secret: checkout.service.paymentCallbackSecret,
            payload,
          })
          deliveredCount += 1
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : 'Payment callback delivery failed',
          )
        }
      }
    }
    if (wantsEmail) {
      if (!isEmailConfigured()) {
        errors.push('SMTP email delivery is not configured')
      } else if (!checkout.tenant.billingEmail) {
        errors.push('Tenant billing email is not configured')
      } else {
        const emailErrors = errors.slice()
        void sendPaymentEmail({
          to: checkout.tenant.billingEmail,
          payload,
        })
          .then(() =>
            db.paymentDelivery.update({
              where: { checkoutId },
              data: {
                status: emailErrors.length === 0 ? 'SUCCEEDED' : 'FAILED',
                lastError:
                  emailErrors.length > 0 ? emailErrors.join('; ') : null,
                deliveredAt: emailErrors.length === 0 ? new Date() : null,
              },
            }),
          )
          .catch((error: unknown) =>
            db.paymentDelivery.update({
              where: { checkoutId },
              data: {
                status: 'FAILED',
                lastError: [
                  ...emailErrors,
                  error instanceof Error
                    ? error.message
                    : 'Payment email failed',
                ].join('; '),
              },
            }),
          )
        emailQueued = true
        deliveredCount += 1
      }
    }
    if (emailQueued) {
      return db.paymentDelivery.update({
        where: { checkoutId },
        data: {
          status: 'PENDING',
          attempts: { increment: 1 },
          lastError: errors.length > 0 ? errors.join('; ') : null,
        },
      })
    }
    if (deliveredCount === 0) {
      return db.paymentDelivery.update({
        where: { checkoutId },
        data: {
          status: 'NOT_CONFIGURED',
          attempts: { increment: 1 },
          lastError: errors.join('; '),
        },
      })
    }
    return db.paymentDelivery.update({
      where: { checkoutId },
      data: {
        status: errors.length === 0 ? 'SUCCEEDED' : 'FAILED',
        attempts: { increment: 1 },
        lastError: errors.length > 0 ? errors.join('; ') : null,
        deliveredAt: errors.length === 0 ? new Date() : null,
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
