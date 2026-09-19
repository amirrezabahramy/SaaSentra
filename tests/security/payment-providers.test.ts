import assert from 'node:assert/strict'
import test from 'node:test'
import { stripeProvider } from '#/lib/payments/stripe.provider'
import { zibalProvider } from '#/lib/payments/zibal.provider'

const originalFetch = globalThis.fetch

function mockFetch(handler: typeof fetch): void {
  globalThis.fetch = handler
}

test('Zibal accepts result 100 and returns verified amount and currency', async () => {
  mockFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { trackId?: string }
    assert.equal(body.trackId, 'track-123')
    return new Response(
      JSON.stringify({ result: 100, amount: 9900, trackId: 'track-123' }),
      { status: 200 },
    )
  })

  try {
    const verified = await zibalProvider.verifyPayment({
      paymentId: 'track-123',
      amountMinor: 9900,
      currency: 'IRR',
    })
    assert.deepEqual(verified, {
      providerPaymentId: 'track-123',
      status: 'SUCCEEDED',
      amountMinor: 9900,
      currency: 'IRR',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Zibal treats non-100 verification results as failed', async () => {
  mockFetch(
    async () =>
      new Response(JSON.stringify({ result: 201, amount: 9900 }), {
        status: 200,
      }),
  )

  try {
    const verified = await zibalProvider.verifyPayment({
      paymentId: 'track-failed',
      amountMinor: 9900,
      currency: 'IRR',
    })
    assert.equal(verified.status, 'FAILED')
    assert.equal(verified.amountMinor, 9900)
    assert.equal(verified.currency, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Stripe uses subscription mode for subscription plans', async () => {
  mockFetch(async (_input, init) => {
    const body = init?.body
    assert.ok(body instanceof URLSearchParams)
    assert.equal(body.get('mode'), 'subscription')
    assert.equal(body.get('line_items[0][price]'), 'price_test')
    assert.equal(body.get('subscription_data[metadata][tenantId]'), 'tenant-1')
    return new Response(
      JSON.stringify({ id: 'cs_test', url: 'https://stripe.test/checkout' }),
      {
        status: 200,
      },
    )
  })

  try {
    const checkout = await stripeProvider.createPayment({
      checkoutId: 'checkout-1',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      planType: 'SUBSCRIPTION',
      isPermanent: false,
      providerPriceId: 'price_test',
      amountMinor: 1900,
      currency: 'USD',
      subscriptionId: 'subscription-1',
      callbackUrl: 'http://localhost:3000/callback',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    })
    assert.deepEqual(checkout, {
      id: 'cs_test',
      url: 'https://stripe.test/checkout',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Stripe uses one-time payment mode for serial-key plans', async () => {
  mockFetch(async (_input, init) => {
    const body = init?.body
    assert.ok(body instanceof URLSearchParams)
    assert.equal(body.get('mode'), 'payment')
    assert.equal(body.get('line_items[0][price]'), 'price_test')
    return new Response(JSON.stringify({ id: 'cs_serial', url: null }), {
      status: 200,
    })
  })

  try {
    const checkout = await stripeProvider.createPayment({
      tenantId: 'tenant-1',
      planId: 'plan-serial',
      planType: 'SERIAL_KEY',
      isPermanent: true,
      providerPriceId: 'price_test',
      amountMinor: 9900,
      currency: 'USD',
      callbackUrl: 'http://localhost:3000/callback',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    })
    assert.deepEqual(checkout, { id: 'cs_serial', url: null })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Stripe direct verification is rejected because webhooks are authoritative', async () => {
  await assert.rejects(
    stripeProvider.verifyPayment({
      paymentId: 'pi_test',
      amountMinor: 1900,
      currency: 'USD',
    }),
    /verified through webhooks/,
  )
})
