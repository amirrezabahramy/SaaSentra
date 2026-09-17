import { createHmac, timingSafeEqual } from 'node:crypto'

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
