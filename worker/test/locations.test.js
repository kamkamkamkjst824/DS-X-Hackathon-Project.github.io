import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requester, startWorker } from './helpers.js'

test('location preferences require auth, validate ranks, persist and isolate accounts', async () => {
  const { mf } = await startWorker()
  try {
    const send = requester(mf)
    const path = '/api/location-preferences'
    assert.equal((await send(path, { method: 'GET' })).status, 401)
    const tokens = []
    for (const email of ['first@bu.edu', 'second@bu.edu']) {
      const response = await send('/api/auth/register', { body: { email, password: 'test-password' } })
      assert.equal(response.status, 201)
      tokens.push((await response.json()).token)
    }
    const token = tokens[0]
    assert.deepEqual(await (await send(path, { method: 'GET', token })).json(), { preferences: [] })
    const preferences = [{ location: 'west', rank: 2 }, { location: 'warren', rank: 1 }]
    assert.equal((await send(path, { method: 'PUT', token, body: { preferences } })).status, 200)
    assert.deepEqual(await (await send(path, { method: 'GET', token })).json(), { preferences: [...preferences].reverse() })
    assert.deepEqual(await (await send(path, { method: 'GET', token: tokens[1] })).json(), { preferences: [] })
    for (const invalid of [[{ location: 'unknown', rank: 1 }], [{ location: 'west', rank: true }], [{ location: 'west', rank: 1 }, { location: 'warren', rank: 1 }], [{ location: 'west', rank: 1 }, { location: 'west', rank: 2 }]]) {
      assert.equal((await send(path, { method: 'PUT', token, body: { preferences: invalid } })).status, 400)
    }
    assert.deepEqual(await (await send(path, { method: 'GET', token })).json(), { preferences: [...preferences].reverse() })
  } finally { await mf.dispose() }
})
