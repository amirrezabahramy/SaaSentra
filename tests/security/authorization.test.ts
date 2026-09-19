import assert from 'node:assert/strict'
import test from 'node:test'
import { isOperatorRole } from '#/lib/authorization'

test('only owner and admin roles can access operator server functions', () => {
  assert.equal(isOperatorRole('OWNER'), true)
  assert.equal(isOperatorRole('ADMIN'), true)
  assert.equal(isOperatorRole('TENANT'), false)
})
