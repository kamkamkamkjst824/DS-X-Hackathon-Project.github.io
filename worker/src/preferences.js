import { HttpError, assertKnownKeys, isPlainObject } from './http.js'

export const DIET_FLAGS = ['vegetarian', 'vegan', 'gluten_free', 'halal']
export const MAX_LIKES_LENGTH = 300
const LIMITS = {
  max_calories: { min: 50, max: 3000, label: 'Maximum calories' },
  min_protein: { min: 0, max: 200, label: 'Minimum protein' },
}
const FIELDS = [...DIET_FLAGS, ...Object.keys(LIMITS), 'likes']

export const DEFAULT_PREFERENCES = Object.freeze({
  vegetarian: false,
  vegan: false,
  gluten_free: false,
  halal: false,
  max_calories: null,
  min_protein: null,
  likes: '',
})

/** Validates a full preferences payload. Missing fields fall back to defaults. */
export function parsePreferences(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Please submit your preferences as a JSON object.')
  assertKnownKeys(body, FIELDS)
  const result = { ...DEFAULT_PREFERENCES }
  for (const flag of DIET_FLAGS) {
    if (body[flag] === undefined) continue
    if (typeof body[flag] !== 'boolean') throw new HttpError(400, `${flag} must be true or false.`)
    result[flag] = body[flag]
  }
  for (const [field, { min, max, label }] of Object.entries(LIMITS)) {
    const value = body[field]
    if (value === undefined || value === null) continue
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}.`)
    }
    result[field] = value
  }
  if (body.likes !== undefined) {
    if (typeof body.likes !== 'string') throw new HttpError(400, 'Food preferences must be text.')
    // Strip control characters and collapse whitespace before length checks.
    const likes = body.likes.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (likes.length > MAX_LIKES_LENGTH) {
      throw new HttpError(400, `Food preferences must be ${MAX_LIKES_LENGTH} characters or fewer.`)
    }
    result.likes = likes
  }
  // Vegan food is always vegetarian.
  if (result.vegan) result.vegetarian = true
  return result
}

function fromRow(row) {
  if (!row) return { ...DEFAULT_PREFERENCES }
  return {
    vegetarian: row.vegetarian === 1,
    vegan: row.vegan === 1,
    gluten_free: row.gluten_free === 1,
    halal: row.halal === 1,
    max_calories: row.max_calories ?? null,
    min_protein: row.min_protein ?? null,
    likes: row.likes ?? '',
  }
}

export async function loadPreferences(db, userId) {
  const row = await db.prepare('SELECT * FROM preferences WHERE user_id = ?').bind(userId).first()
  return { preferences: fromRow(row), updatedAt: row?.updated_at ?? null }
}

export async function savePreferences(db, userId, preferences) {
  const updatedAt = Date.now()
  await db.prepare(`
    INSERT INTO preferences (user_id, vegetarian, vegan, gluten_free, halal, max_calories, min_protein, likes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      vegetarian = excluded.vegetarian,
      vegan = excluded.vegan,
      gluten_free = excluded.gluten_free,
      halal = excluded.halal,
      max_calories = excluded.max_calories,
      min_protein = excluded.min_protein,
      likes = excluded.likes,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    preferences.vegetarian ? 1 : 0,
    preferences.vegan ? 1 : 0,
    preferences.gluten_free ? 1 : 0,
    preferences.halal ? 1 : 0,
    preferences.max_calories,
    preferences.min_protein,
    preferences.likes,
    updatedAt,
  ).run()
  return { preferences, updatedAt }
}
