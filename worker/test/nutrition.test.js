import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requester, startWorker } from './helpers.js'

test('nutrition preferences require auth, validate goals, persist and isolate accounts', async () => {
  const { mf } = await startWorker()
  try {
    const send = requester(mf)
    const path = '/api/nutrition-preferences'
    assert.equal((await send(path, { method: 'GET' })).status, 401)
    const tokens = []
    for (const email of ['first@bu.edu', 'second@bu.edu']) {
      const response = await send('/api/auth/register', { body: { email, password: 'test-password' } })
      assert.equal(response.status, 201)
      tokens.push((await response.json()).token)
    }
    const token = tokens[0]
    assert.deepEqual(await (await send(path, { method: 'GET', token })).json(), { goals: {}, goalScope: 'daily', updatedAt: null })

    const goals = { protein: 100, calories: 2000.5 }
    const saved = await send(path, { method: 'PUT', token, body: { goals, goal_scope: 'per-serving' } })
    assert.equal(saved.status, 200)
    const loaded = await (await send(path, { method: 'GET', token })).json()
    assert.deepEqual(loaded.goals, { calories: 2000.5, protein: 100 })
    assert.equal(loaded.goalScope, 'per-serving')
    assert.equal(typeof loaded.updatedAt, 'number')
    assert.deepEqual((await (await send(path, { method: 'GET', token: tokens[1] })).json()).goals, {})

    for (const invalid of [{ goals: { sugar: 1 } }, { goals: { calories: -1 } }, { goals: { calories: '10' } }, { goals: { protein: 100001 } }, { goals: [] }, { extra: 1, goals: {} }]) {
      assert.equal((await send(path, { method: 'PUT', token, body: invalid })).status, 400)
    }
    assert.deepEqual((await (await send(path, { method: 'GET', token })).json()).goals, { calories: 2000.5, protein: 100 })

    // Saving an empty object resets the goals.
    assert.equal((await send(path, { method: 'PUT', token, body: { goals: {}, goal_scope: 'daily' } })).status, 200)
    assert.deepEqual((await (await send(path, { method: 'GET', token })).json()).goals, {})
  } finally { await mf.dispose() }
})
