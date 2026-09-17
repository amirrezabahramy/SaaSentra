import { env } from '#/env'
import { stripeRequest, stringValue } from '#/lib/stripe'
import type {
  CreatePaymentInput,
  PaymentCheckout,
  PaymentProviderAdapter,
  VerifiedPayment,
  VerifyPaymentInput,
} from './types'

export const stripeProvider: PaymentProviderAdapter = {
  provider: 'STRIPE',

  async createPayment(input: CreatePaymentInput): Promise<PaymentCheckout> {
    if (!input.providerPriceId)
      throw new Error('Stripe plan has no provider price ID')
    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': input.providerPriceId,
      'line_items[0][quantity]': '1',
      success_url: `${env.BETTER_AUTH_URL}/?checkout=success`,
      cancel_url: `${env.BETTER_AUTH_URL}/?checkout=canceled`,
      'metadata[tenantId]': input.tenantId,
      'metadata[planId]': input.planId,
      'subscription_data[metadata][tenantId]': input.tenantId,
      'subscription_data[metadata][planId]': input.planId,
    })
    if (input.checkoutId) params.set('client_reference_id', input.checkoutId)
    if (input.subscriptionId) {
      params.set('metadata[subscriptionId]', input.subscriptionId)
      params.set(
        'subscription_data[metadata][subscriptionId]',
        input.subscriptionId,
      )
    }

    const checkout = await stripeRequest<{ id?: unknown; url?: unknown }>(
      '/checkout/sessions',
      params,
    )
    const id = stringValue(checkout.id)
    if (!id) throw new Error('Stripe did not return a checkout session ID')
    return { id, url: stringValue(checkout.url) }
  },

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifiedPayment> {
    throw new Error('Stripe payments are verified through webhooks')
  },
}
