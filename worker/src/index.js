import { HttpError, json, readJson } from './http.js'
import { loadLocations, saveLocations, parseLocationPreferences } from './locations.js'
import { loadPreferences, parsePreferences, savePreferences } from './preferences.js'
import { loadNutritionGoals, parseNutritionGoals, saveNutritionGoals } from './nutrition.js'
import { loadRecommendationSettings, parseRecommendationSettings, saveRecommendationSettings } from './recommendation-settings.js'
import { enforceRateLimit } from './ratelimit.js'
import { parseRecommendRequest, recommend } from './recommend.js'
import { LOCATION_IDS, fetchMenu, UpstreamError } from './dining.js'

const ITERATIONS = 100_000
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
const encoder = new TextEncoder()
const EMAIL_PATTERN = /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@bu\.edu$/
const RECOMMEND_LIMIT = { bucket: 'recommend', limit: 6, windowMs: 60_000 }
const MENU_LIMIT = { bucket: 'menu', limit: 30, windowMs: 60_000 }

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function unhex(value) {
  return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16))
}

async function passwordHash(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return hex(new Uint8Array(bits))
}

async function tokenHash(token) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))))
}

function equalHash(left, right) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return difference === 0
}

async function credentials(request) {
  const data = await readJson(request, {
    typeMessage: 'Please submit your email and password as JSON.',
    emptyMessage: 'Please enter your email and password.',
  })
  if (!data || typeof data.email !== 'string' || typeof data.password !== 'string') {
    throw new HttpError(400, 'Please enter your email and password.')
  }
  const email = data.email.trim().toLowerCase()
  if (email.length > 254 || email.split('@')[0].length > 64 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'Please use an @bu.edu email address.')
  }
  if (data.password.length < 8 || data.password.length > 128) {
    throw new HttpError(400, 'Your password must be 8–128 characters long.')
  }
  return { email, password: data.password }
}

async function newSession(userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  return { token, hash: await tokenHash(token), userId, expiresAt: Date.now() + SESSION_TTL }
}

function sessionInsert(db, session) {
  return db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(session.hash, session.userId, session.expiresAt)
}

function sessionResponse(user, session, status = 200) {
  return json({ user: { id: user.id, email: user.email }, token: session.token, expiresAt: session.expiresAt }, status)
}

async function authenticate(request, db) {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('Authorization') || '')
  if (!match) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  const hash = await tokenHash(match[1])
  const session = await db.prepare(`
    SELECT users.id, users.email FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(hash, Date.now()).first()
  if (!session) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  return { user: session, hash }
}

async function register(request, env) {
  const db = env.DB
  const { email, password } = await credentials(request)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await passwordHash(password, salt)
  const user = { id: crypto.randomUUID(), email }
  const session = await newSession(user.id)
  try {
    // Batch is atomic: registration cannot leave a user without its initial session.
    await db.batch([
      db.prepare(`INSERT INTO users (id, email, password_hash, password_salt, password_iterations, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(user.id, email, hash, hex(salt), ITERATIONS, Date.now()),
      sessionInsert(db, session),
    ])
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed: users.email')) {
      throw new HttpError(409, 'This email is already registered. Please sign in.')
    }
    throw error
  }
  return sessionResponse(user, session, 201)
}

async function login(request, env) {
  const db = env.DB
  const { email, password } = await credentials(request)
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
  // Perform the same expensive operation for unknown users.
  const hash = await passwordHash(password, user ? unhex(user.password_salt) : new Uint8Array(16), user?.password_iterations ?? ITERATIONS)
  if (!user || !equalHash(hash, user.password_hash)) throw new HttpError(401, 'Incorrect email or password.')
  const session = await newSession(user.id)
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()),
    sessionInsert(db, session),
  ])
  return sessionResponse(user, session)
}

// Handlers wrapped with `authed` receive the authenticated session as a third argument.
function authed(handler) {
  return async (request, env) => handler(request, env, await authenticate(request, env.DB))
}

async function getPreferences(request, env, { user }) {
  const { preferences, updatedAt } = await loadPreferences(env.DB, user.id)
  return json({ preferences, updatedAt })
}

async function putPreferences(request, env, { user }) {
  const preferences = parsePreferences(await readJson(request))
  return json(await savePreferences(env.DB, user.id, preferences))
}

async function postRecommend(request, env, { user }) {
  const query = parseRecommendRequest(await readJson(request))
  if (!env.BU_API_KEY) throw new HttpError(503, 'Dining recommendations are not configured yet. Please try again later.')
  await enforceRateLimit(env.DB, user.id, RECOMMEND_LIMIT)
  const { preferences } = await loadPreferences(env.DB, user.id)
  const [{ goals, goalScope }, { preferences: locationPreferences }, settings] = await Promise.all([
    loadNutritionGoals(env.DB, user.id), loadLocations(env.DB, user.id), loadRecommendationSettings(env.DB, user.id),
  ])
  const locationRanks = Object.fromEntries(locationPreferences.map(({ location, rank }) => [location, rank]))
  const selectedLocations = query.locations.filter(id => Object.hasOwn(locationRanks, id))
  if (!selectedLocations.length) throw new HttpError(400, 'Choose at least one included dining location before requesting recommendations.')
  const result = await recommend({ preferences, goals, goalScope, locationRanks, settings, ...query, locations: selectedLocations }, {
    apiKey: env.BU_API_KEY,
    fetcher: (input, init) => fetch(input, init),
    cache: typeof caches !== 'undefined' ? caches.default : null,
    ai: env.AI ?? null,
    log: (...args) => console.warn('[recommend]', ...args),
  })
  return json(result)
}

async function getMenu(request, env, { user }) {
  const url = new URL(request.url)
  const location = url.pathname.split('/')[5]
  const { date } = parseRecommendRequest({
    date: url.searchParams.get('day') ?? undefined,
    meal: 'Lunch',
    locations: [location],
  })
  if (!env.BU_API_KEY) throw new HttpError(503, 'Dining menus are not configured yet. Please try again later.')
  await enforceRateLimit(env.DB, user.id, MENU_LIMIT)
  try {
    return json(await fetchMenu(location, date, {
      apiKey: env.BU_API_KEY,
      fetcher: (input, init) => fetch(input, init),
      cache: typeof caches !== 'undefined' ? caches.default : null,
    }))
  } catch (error) {
    if (error instanceof UpstreamError) {
      // Upstream credentials are a server issue, not an expired user session.
      throw new HttpError(error.status === 504 ? 504 : 502,
        error.status === 401 || error.status === 403
          ? 'The dining service could not authenticate with BU. Please contact the administrator.'
          : 'BU Dining menus are temporarily unavailable. Please try again later.')
    }
    throw error
  }
}

// path → { METHOD: handler }. Unknown paths are 404; known paths with other methods are 405.
const ROUTES = {
  '/api/auth/register': { POST: register },
  '/api/auth/login': { POST: login },
  '/api/auth/me': { GET: authed(async (request, env, { user }) => json({ user })) },
  '/api/auth/logout': {
    POST: authed(async (request, env, { hash }) => {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run()
      return json({ success: true })
    }),
  },
  '/api/preferences': { GET: authed(getPreferences), PUT: authed(putPreferences) },
  '/api/location-preferences': {
    GET: authed(async (request, env, { user }) => json(await loadLocations(env.DB, user.id))),
    PUT: authed(async (request, env, { user }) => json(await saveLocations(env.DB, user.id, parseLocationPreferences(await readJson(request))))),
  },
  '/api/recommendation-settings': {
    GET: authed(async (request, env, { user }) => json(await loadRecommendationSettings(env.DB, user.id))),
    PUT: authed(async (request, env, { user }) => json(await saveRecommendationSettings(env.DB, user.id, parseRecommendationSettings(await readJson(request))))),
  },
  '/api/nutrition-preferences': {
    GET: authed(async (request, env, { user }) => json(await loadNutritionGoals(env.DB, user.id))),
    PUT: authed(async (request, env, { user }) => json(await saveNutritionGoals(env.DB, user.id, parseNutritionGoals(await readJson(request))))),
  },
  '/api/recommend': { POST: authed(postRecommend) },
  ...Object.fromEntries(LOCATION_IDS.map(location => [
    `/api/v1/dining/locations/${location}/menu`, { GET: authed(getMenu) },
  ])),
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
    const cors = { Vary: 'Origin' }
    if (origin && !allowed.includes(origin)) return json({ error: 'This origin is not allowed.' }, 403, cors)
    if (origin) cors['Access-Control-Allow-Origin'] = origin
    const path = new URL(request.url).pathname
    let response
    try {
      const route = ROUTES[path]
      if (!route) throw new HttpError(404, 'Endpoint not found.')
      const methods = Object.keys(route).join(', ')
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: {
          ...cors,
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Methods': `${methods}, OPTIONS`,
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600',
        } })
      }
      const handler = route[request.method]
      if (!handler) {
        return json({ error: 'Method not allowed.' }, 405, { ...cors, Allow: `${methods}, OPTIONS` })
      }
      response = await handler(request, env)
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Unhandled error', error)
      response = error instanceof HttpError
        ? json({ error: error.message }, error.status, error.headers)
        : json({ error: 'Service temporarily unavailable. Please try again later.' }, 500)
    }
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value)
    return response
  },
}
