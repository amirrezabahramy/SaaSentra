import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import test from 'node:test'
import {
  generateServiceApiKey,
  hashServiceApiKey,
} from '#/lib/service-credentials'

test('service API keys have a non-guessable prefixed format', () => {
  const first = generateServiceApiKey()
  const second = generateServiceApiKey()

  assert.match(first, /^svc_[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first, second)
})

test('service API keys are stored as one-way bcrypt hashes', async () => {
  const apiKey = generateServiceApiKey()
  const hash = await hashServiceApiKey(apiKey)

  assert.notEqual(hash, apiKey)
  assert.equal(await bcrypt.compare(apiKey, hash), true)
  assert.equal(await bcrypt.compare(`${apiKey}-wrong`, hash), false)
})
