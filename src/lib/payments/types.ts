import type { Currency, PaymentProvider } from '#/generated/prisma/client'

export type { Currency, PaymentProvider }

export type CreatePaymentInput = {
  tenantId: string
  planId: string
  providerPriceId?: string
  amountMinor: number
  currency: Currency
  subscriptionId?: string
  callbackUrl: string
  successUrl: string
  cancelUrl: string
}

export type PaymentCheckout = {
  id: string
  url: string | null
}

export type VerifyPaymentInput = {
  paymentId: string
  amountMinor?: number
  currency?: Currency
}

export type VerifiedPayment = {
  providerPaymentId: string
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING'
  amountMinor: number | null
  currency: Currency | null
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider
  createPayment: (input: CreatePaymentInput) => Promise<PaymentCheckout>
  verifyPayment: (input: VerifyPaymentInput) => Promise<VerifiedPayment>
}
