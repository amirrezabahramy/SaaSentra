import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertMatchingExternalOrigin,
  parseExternalUrl,
} from '#/lib/external-url'
import {
  deliverPaymentCallback,
  MAX_CALLBACK_RESPONSE_BYTES,
} from '#/lib/payments/headless'

const originalFetch = globalThis.fetch

test('rejects private callback destinations', async () => {
  await assert.rejects(() => parseExternalUrl('https://127.0.0.1/hooks'))
  await assert.rejects(() => parseExternalUrl('https://192.168.1.5/hooks'))
})

test('rejects cross-origin payment return URLs', async () => {
  await assert.rejects(() =>
    assertMatchingExternalOrigin(
      'https://8.8.8.8/payment-result',
      'https://1.1.1.1/payment-callback',
    ),
  )
})

test('retries transient callback failures and does not follow redirects', async () => {
  let calls = 0
  globalThis.fetch = async (_input, init) => {
    calls += 1
    assert.equal(init?.redirect, 'manual')
    return calls === 1
      ? new Response('temporary failure', { status: 503 })
      : new Response(null, { status: 204 })
  }

  try {
    const result = await deliverPaymentCallback({
      url: 'http://localhost:3000/payment-callback',
      secret: 'callback-secret',
      payload: { event: 'payment.succeeded' },
    })
    assert.deepEqual(result, { delivered: true, skipped: false })
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects callback responses that exceed the response size limit', async () => {
  globalThis.fetch = async () =>
    new Response('x'.repeat(MAX_CALLBACK_RESPONSE_BYTES + 1), { status: 200 })

  try {
    await assert.rejects(
      () =>
        deliverPaymentCallback({
          url: 'http://localhost:3000/payment-callback',
          secret: 'callback-secret',
          payload: { event: 'payment.succeeded' },
        }),
      /response exceeded the size limit/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
