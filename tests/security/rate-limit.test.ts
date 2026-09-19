import assert from 'node:assert/strict'
import test from 'node:test'
import { clearRateLimitsForTests, consumeRateLimit } from '#/lib/rate-limit'

test('blocks requests after the configured limit', async () => {
  await clearRateLimitsForTests()
  assert.equal(
    await consumeRateLimit('security-test', { limit: 2, windowMs: 60_000 }),
    true,
  )
  assert.equal(
    await consumeRateLimit('security-test', { limit: 2, windowMs: 60_000 }),
    true,
  )
  assert.equal(
    await consumeRateLimit('security-test', { limit: 2, windowMs: 60_000 }),
    false,
  )
})
