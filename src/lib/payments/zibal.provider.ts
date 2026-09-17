import { env } from '#/env'
import type {
  CreatePaymentInput,
  PaymentCheckout,
  PaymentProviderAdapter,
  VerifiedPayment,
  VerifyPaymentInput,
} from './types'

const zibalApi = 'https://gateway.zibal.ir'
type ZibalRecord = Record<string, unknown>

function record(value: unknown): ZibalRecord {
  return typeof value === 'object' && value !== null
    ? (value as ZibalRecord)
    : {}
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

async function zibalRequest(path: string, body: ZibalRecord) {
  if (!env.ZIBAL_MERCHANT) throw new Error('Zibal merchant is not configured')
  const response = await fetch(`${zibalApi}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: env.ZIBAL_MERCHANT, ...body }),
  })
  const result: unknown = await response.json()
  if (!response.ok) throw new Error('Zibal request failed')
  return record(result)
}

function zibalError(result: ZibalRecord, fallback: string) {
  return stringValue(result.message) ?? fallback
}

export const zibalProvider: PaymentProviderAdapter = {
  provider: 'ZIBAL',

  async createPayment(input: CreatePaymentInput): Promise<PaymentCheckout> {
    if (input.currency !== 'IRR') throw new Error('Zibal payments must use IRR')
    const result = await zibalRequest('/v1/request', {
      amount: input.amountMinor,
      callbackUrl: input.callbackUrl,
      description: `Subscription payment for tenant ${input.tenantId}`,
      orderId:
        input.checkoutId ??
        input.subscriptionId ??
        `${input.tenantId}-${Date.now()}`,
    })
    if (numberValue(result.resultCode) !== 100)
      throw new Error(zibalError(result, 'Zibal payment request failed'))
    const trackId = stringValue(result.trackId)
    if (!trackId) throw new Error('Zibal did not return a track ID')
    return { id: trackId, url: `${zibalApi}/start/${trackId}` }
  },

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment> {
    const result = await zibalRequest('/v1/verify', {
      trackId: input.paymentId,
    })
    const succeeded = numberValue(result.resultCode) === 100
    return {
      providerPaymentId: input.paymentId,
      status: succeeded ? 'SUCCEEDED' : 'FAILED',
      amountMinor: numberValue(result.amount),
      currency: succeeded ? 'IRR' : null,
    }
  },
}
