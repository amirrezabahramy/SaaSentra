import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { verifyStripeSignature } from '#/lib/stripe'

test('accepts a current valid Stripe signature and rejects tampering and replay', () => {
  const payload = JSON.stringify({
    id: 'evt_security_test',
    type: 'invoice.paid',
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!)
    .update(`${timestamp}.${payload}`)
    .digest('hex')

  assert.equal(
    verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`),
    true,
  )
  assert.equal(
    verifyStripeSignature(`${payload}x`, `t=${timestamp},v1=${signature}`),
    false,
  )
  assert.equal(
    verifyStripeSignature(payload, `t=${timestamp - 301},v1=${signature}`),
    false,
  )
})
