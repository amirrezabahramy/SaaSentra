import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertMatchingExternalOrigin,
  parseExternalUrl,
} from '#/lib/external-url'

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
