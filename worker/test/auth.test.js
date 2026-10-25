import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { origin, requester, startWorker } from './helpers.js'

let mf
let db
let send
const password = '  test password  '

const request = (path, options) => send(`/api/auth${path}`, options)

before(async () => {
  ({ mf, db } = await startWorker())
  send = requester(mf)
})
after(async () => { await mf?.dispose() })

test('registration normalizes email, hashes credentials, issues a seven-day session', async () => {
  const start = Date.now()
  const response = await request('/register', { body: { email: '  Student@BU.EDU ', password } })
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
  const data = await response.json()
  assert.equal(data.user.email, 'student@bu.edu')
  assert.match(data.token, /^[a-f0-9]{64}$/)
  assert.ok(data.expiresAt >= start + 7 * 86400000)
  assert.ok(data.expiresAt <= Date.now() + 7 * 86400000)
  assert.deepEqual(Object.keys(data.user).sort(), ['email', 'id'])
  const stored = await db.prepare('SELECT * FROM users WHERE id = ?').bind(data.user.id).first()
  assert.notEqual(stored.password_hash, password)
  assert.equal(stored.password_iterations, 100000)
  assert.equal(stored.password_salt.length, 32)
  const session = await db.prepare('SELECT * FROM sessions WHERE user_id = ?').bind(data.user.id).first()
  assert.notEqual(session.token_hash, data.token)
  const me = await request('/me', { method: 'GET', token: data.token })
  assert.equal(me.status, 200)
  assert.deepEqual(await me.json(), { user: data.user })
})

test('duplicate and concurrent registrations cannot create multiple users', async () => {
  const duplicate = await request('/register', { body: { email: 'STUDENT@bu.edu', password } })
  assert.equal(duplicate.status, 409)
  assert.equal((await duplicate.json()).error, 'This email is already registered. Please sign in.')
  const results = await Promise.all([1, 2].map(() => request('/register', { body: { email: 'concurrent@bu.edu', password } })))
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
  const count = await db.prepare("SELECT COUNT(*) AS total FROM users WHERE email = 'concurrent@bu.edu'").first()
  assert.equal(count.total, 1)
})

test('registration rejects invalid domains, malformed email, passwords and payloads', async () => {
  for (const email of ['a@gmail.com', 'a@cs.bu.edu', 'a@fakebu.edu', 'a@bu.edu.evil.com', 'a@@bu.edu', '.a@bu.edu', 'a..b@bu.edu', 'a b@bu.edu']) {
    assert.equal((await request('/register', { body: { email, password } })).status, 400, email)
  }
  for (const invalidPassword of ['', '1234567', 'a'.repeat(129), 12345678, null]) {
    assert.equal((await request('/register', { body: { email: 'invalid@bu.edu', password: invalidPassword } })).status, 400)
  }
  for (const body of [null, [], {}, { email: 42, password }]) {
    assert.equal((await request('/register', { body })).status, 400)
  }
  const malformed = await mf.dispatchFetch('http://localhost/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{bad',
  })
  assert.equal(malformed.status, 400)
  assert.equal((await request('/register', { body: { email: 'big@bu.edu', password, extra: 'x'.repeat(5000) } })).status, 400)
  assert.equal((await request('/register', { body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 400)
})

test('login preserves password spaces and uses uniform errors', async () => {
  const success = await request('/login', { body: { email: 'STUDENT@bu.edu', password } })
  assert.equal(success.status, 200)
  const wrong = await request('/login', { body: { email: 'student@bu.edu', password: password.trim() } })
  const missing = await request('/login', { body: { email: 'missing@bu.edu', password } })
  assert.equal(wrong.status, 401)
  assert.equal(missing.status, 401)
  const error = await wrong.json()
  assert.deepEqual(error, await missing.json())
  assert.deepEqual(error, { error: 'Incorrect email or password.' })
})

test('password boundaries work and each user has an independent random salt', async () => {
  const rows = []
  for (const length of [8, 128]) {
    const response = await request('/register', { body: { email: `boundary${length}@bu.edu`, password: 'x'.repeat(length) } })
    assert.equal(response.status, 201)
    rows.push(await db.prepare('SELECT password_salt FROM users WHERE email = ?').bind(`boundary${length}@bu.edu`).first())
  }
  assert.notEqual(rows[0].password_salt, rows[1].password_salt)
})

test('missing, malformed and expired tokens fail; logout revokes only its session', async () => {
  for (const token of [undefined, 'invalid', '0'.repeat(64)]) {
    assert.equal((await request('/me', { method: 'GET', token })).status, 401)
  }
  const login = async () => (await request('/login', { body: { email: 'student@bu.edu', password } })).json()
  const first = await login()
  const second = await login()
  assert.notEqual(first.token, second.token)
  assert.equal((await request('/logout', { token: first.token })).status, 200)
  assert.equal((await request('/me', { method: 'GET', token: first.token })).status, 401)
  assert.equal((await request('/me', { method: 'GET', token: second.token })).status, 200)
  await db.prepare('UPDATE sessions SET expires_at = 0 WHERE user_id = ?').bind(second.user.id).run()
  assert.equal((await request('/me', { method: 'GET', token: second.token })).status, 401)
})

test('CORS, preflight, methods and errors are consistent', async () => {
  const preflight = await request('/register', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization',
  } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/)
  const denied = await request('/register', { body: {}, headers: { Origin: 'https://evil.example' } })
  assert.equal(denied.status, 403)
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null)
  const method = await request('/register', { method: 'GET' })
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('Allow'), 'POST, OPTIONS')
  assert.equal((await request('/missing', { method: 'GET' })).status, 404)
  const invalid = await request('/me', { method: 'GET' })
  assert.equal(invalid.headers.get('Access-Control-Allow-Origin'), origin)
  assert.equal(invalid.headers.get('Cache-Control'), 'no-store')
})

test('unknown authenticated paths return 404 without revoking the session', async () => {
  const { token } = await (await request('/login', { body: { email: 'student@bu.edu', password } })).json()
  assert.equal((await request('/unknown', { token })).status, 404)
  assert.equal((await send('/api/other', { method: 'GET', token })).status, 404)
  assert.equal((await request('/me', { method: 'GET', token })).status, 200)
  const preflight = await send('/api/preferences', { method: 'OPTIONS' })
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, PUT, OPTIONS')
})
