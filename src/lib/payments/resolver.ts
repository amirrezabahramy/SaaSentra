import { stripeProvider } from './stripe.provider'
import { zibalProvider } from './zibal.provider'
import type { PaymentProvider, PaymentProviderAdapter } from './types'

const providers: Partial<Record<PaymentProvider, PaymentProviderAdapter>> = {
  STRIPE: stripeProvider,
  ZIBAL: zibalProvider,
}

export function resolvePaymentProvider(
  provider: PaymentProvider,
): PaymentProviderAdapter {
  const adapter = providers[provider]
  if (!adapter) {
    throw new Error(`Payment provider is not configured: ${provider}`)
  }
  return adapter
}
