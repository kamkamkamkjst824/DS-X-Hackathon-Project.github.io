import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { todayInNewYork } from '../src/dining.js'
import { fakeBu } from './fixtures.js'
import { requester, startWorker } from './helpers.js'

let mf
let db
let send
const bu = fakeBu({ fail: ['marciano'] })

async function account(email) {
  const response = await send('/api/auth/register', { body: { email, password: 'password123' } })
  return (await response.json()).token
}

async function includeLocation(token, location = 'warren', second = null) {
  const preferences = [{ location, rank: 1 }, ...(second ? [{ location: second, rank: 2 }] : [])]
  return send('/api/location-preferences', { method: 'PUT', token, body: { preferences } })
}

before(async () => {
  // No AI binding here: the Worker must fall back to rule-based ranking.
  ({ mf, db } = await startWorker({ bindings: { BU_API_KEY: 'test-key' }, outboundService: bu.handler }))
  send = requester(mf)
})
after(async () => { await mf?.dispose() })

test('preferences require auth, default, round-trip and are isolated per user', async () => {
  assert.equal((await send('/api/preferences', { method: 'GET' })).status, 401)
  assert.equal((await send('/api/preferences', { method: 'PUT', body: {} })).status, 401)
  const alice = await account('alice@bu.edu')
  const bob = await account('bob@bu.edu')
  const empty = await (await send('/api/preferences', { method: 'GET', token: alice })).json()
  assert.deepEqual(empty, {
    preferences: { vegetarian: false, vegan: false, gluten_free: false, halal: false, max_calories: null, min_protein: null, likes: '' },
    updatedAt: null,
  })
  const body = { vegetarian: false, vegan: false, gluten_free: true, halal: true, max_calories: 700, min_protein: 20, likes: 'Spicy chicken, curry' }
  const saved = await send('/api/preferences', { method: 'PUT', token: alice, body })
  assert.equal(saved.status, 200)
  const loaded = await (await send('/api/preferences', { method: 'GET', token: alice })).json()
  assert.deepEqual(loaded.preferences, body)
  assert.ok(loaded.updatedAt > 0)
  assert.equal((await (await send('/api/preferences', { method: 'GET', token: bob })).json()).preferences.halal, false)
  for (const invalid of [{ halal: 1 }, { likes: 'x'.repeat(301) }, { max_calories: 99999 }, { role: 'admin' }]) {
    const response = await send('/api/preferences', { method: 'PUT', token: alice, body: invalid })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /^[\x20-\x7e]+$/, 'errors are plain English')
  }
  assert.deepEqual((await (await send('/api/preferences', { method: 'GET', token: alice })).json()).preferences, body)
  assert.equal((await send('/api/preferences', { method: 'POST', token: alice, body })).status, 405)
})

test('recommend applies saved preferences, survives a failed hall and enriches details', async () => {
  assert.equal((await send('/api/recommend', { body: { meal: 'Lunch' } })).status, 401)
  const carol = await account('carol@bu.edu')
  await includeLocation(carol, 'warren', 'marciano')
  await send('/api/preferences', { method: 'PUT', token: carol, body: { halal: true, likes: 'chicken' } })
  const today = todayInNewYork()
  const response = await send('/api/recommend', { token: carol, body: { meal: 'Lunch' } })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.date, today)
  assert.equal(data.fallback, true)
  assert.ok(data.warnings.includes('Marciano Commons menu is unavailable right now.'))
  assert.deepEqual(data.recommendations.map(r => r.item_id), ['W1', 'W2'])
  assert.ok(data.recommendations.every(r => r.tags.halal))
  assert.equal(data.recommendations[0].ingredients, 'Ingredients of Chicken Tikka Masala')
  assert.deepEqual(data.best_location, { id: 'warren', name: 'Warren Towers' })
  assert.equal(data.best_location_source, 'weighted')
  // No AI binding in this Worker: the interpretation degrades to literal keyword matching.
  assert.equal(data.preference_interpretation.source, 'fallback')
  assert.deepEqual(data.preference_interpretation.keywords, ['chicken'])
  assert.ok(bu.calls.length > 0 && bu.calls.every(call => call.key === 'test-key'))
  assert.equal((await send('/api/recommend', { token: carol, body: { meal: 'Snack' } })).status, 400)
  assert.equal((await send('/api/recommend', { token: carol, body: { meal: 'Lunch', locations: ['nowhere'] } })).status, 400)
})

test('recommend is rate limited per user', async () => {
  const dave = await account('dave@bu.edu')
  await includeLocation(dave, 'west')
  const statuses = []
  for (let i = 0; i < 7; i++) statuses.push((await send('/api/recommend', { token: dave, body: { meal: 'Lunch', locations: ['west'] } })).status)
  // The window may roll over mid-loop; at least one request must be limited unless it did.
  const limited = await send('/api/recommend', { token: dave, body: { meal: 'Lunch', locations: ['west'] } })
  statuses.push(limited.status)
  assert.ok(statuses.includes(429), statuses.join(','))
  const tooFast = statuses.indexOf(429)
  assert.ok(statuses.slice(0, tooFast).every(status => status === 200))
  const other = await account('erin@bu.edu')
  await includeLocation(other, 'west')
  assert.equal((await send('/api/recommend', { token: other, body: { meal: 'Lunch', locations: ['west'] } })).status, 200)
})

test('recommend reports a configuration error when the BU key is missing', async () => {
  const { mf: bare } = await startWorker({ outboundService: bu.handler })
  try {
    const token = (await (await requester(bare)('/api/auth/register', { body: { email: 'frank@bu.edu', password: 'password123' } })).json()).token
    const response = await requester(bare)('/api/recommend', { token, body: { meal: 'Lunch' } })
    assert.equal(response.status, 503)
    assert.equal((await requester(bare)('/api/v1/dining/locations/warren/menu', { method: 'GET', token })).status, 503)
  } finally {
    await bare.dispose()
  }
})

test('menu proxy requires auth, validates dates and uses the server key', async () => {
  const path = `/api/v1/dining/locations/warren/menu?day=${todayInNewYork()}`
  assert.equal((await send(path, { method: 'GET' })).status, 401)
  const token = await account('menus@bu.edu')
  const response = await send(path, { method: 'GET', token })
  assert.equal(response.status, 200)
  assert.ok(Array.isArray((await response.json()).meals))
  assert.ok(bu.calls.some(call => call.key === 'test-key'))
  assert.equal((await send('/api/v1/dining/locations/warren/menu?day=invalid', { method: 'GET', token })).status, 400)
  assert.equal((await send('/api/v1/dining/locations/warren/menu?day=2000-01-01', { method: 'GET', token })).status, 400)
  assert.equal((await send('/api/v1/dining/locations/unknown/menu', { method: 'GET', token })).status, 404)
  const preflight = await send(path, { method: 'OPTIONS' })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/)
})

test('menu upstream auth failures are 502 and do not expire the user session', async () => {
  const { mf: rejected } = await startWorker({
    bindings: { BU_API_KEY: 'invalid-key' },
    outboundService: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
  })
  try {
    const request = requester(rejected)
    const token = (await (await request('/api/auth/register', { body: { email: 'rejected@bu.edu', password: 'password123' } })).json()).token
    const response = await request('/api/v1/dining/locations/west/menu', { method: 'GET', token })
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /administrator/)
    assert.equal((await request('/api/auth/me', { method: 'GET', token })).status, 200)
  } finally {
    await rejected.dispose()
  }
})
