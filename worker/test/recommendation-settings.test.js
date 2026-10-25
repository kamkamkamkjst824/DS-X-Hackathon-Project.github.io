import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requester, startWorker } from './helpers.js'

test('recommendation settings require auth and persist per account', async () => {
  const { mf } = await startWorker()
  try {
    const send = requester(mf)
    const path = '/api/recommendation-settings'
    assert.equal((await send(path, { method: 'GET' })).status, 401)
    const tokens = []
    for (const email of ['first@bu.edu', 'second@bu.edu']) {
      tokens.push((await (await send('/api/auth/register', { body: { email, password: 'test-password' } })).json()).token)
    }
    const defaults = await (await send(path, { method: 'GET', token: tokens[0] })).json()
    assert.equal(defaults.mode, 'default')
    const settings = { mode: 'advanced', priority_order: { nutrition: 2, food: 1, location: 3 }, custom_weights: { nutrition: 20, food: 70, location: 10 } }
    assert.equal((await send(path, { method: 'PUT', token: tokens[0], body: settings })).status, 200)
    assert.equal((await (await send(path, { method: 'GET', token: tokens[0] })).json()).mode, 'advanced')
    assert.equal((await (await send(path, { method: 'GET', token: tokens[1] })).json()).mode, 'default')
  } finally { await mf.dispose() }
})
