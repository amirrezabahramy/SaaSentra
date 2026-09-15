import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '#/env'

const stripeApi = 'https://api.stripe.com/v1'

type StripeRecord = Record<string, unknown>

export function record(value: unknown): StripeRecord {
  return typeof value === 'object' && value !== null
    ? (value as StripeRecord)
    : {}
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function numberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

export async function stripeRequest<T extends StripeRecord>(
  path: string,
  params: URLSearchParams,
): Promise<T> {
  const response = await fetch(`${stripeApi}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = stringValue(record(body).message) ?? 'Stripe request failed'
    throw new Error(message)
  }
  return record(body) as T
}

export function verifyStripeSignature(
  payload: string,
  signature: string,
): boolean {
  const values = new Map(
    signature.split(',').map((part) => {
      const [key, value] = part.split('=', 2)
      return [key, value] as const
    }),
  )
  const timestamp = values.get('t')
  const provided = values.get('v1')
  if (!timestamp || !provided) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false
  const expected = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const providedBuffer = Buffer.from(provided, 'utf8')
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  )
}
