import { HttpError, assertKnownKeys, isPlainObject } from './http.js'

export const DEFAULT_PRIORITY_ORDER = Object.freeze({ nutrition: 1, food: 2, location: 3 })
export const DEFAULT_WEIGHTS = Object.freeze({ nutrition: 45, food: 35, location: 20 })
const CATEGORIES = Object.keys(DEFAULT_WEIGHTS)

export function parseRecommendationSettings(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Expected a JSON object.')
  assertKnownKeys(body, ['mode', 'priority_order', 'custom_weights'])
  if (!['default', 'advanced'].includes(body.mode)) throw new HttpError(400, 'mode must be default or advanced.')
  const order = body.priority_order
  if (!isPlainObject(order)) throw new HttpError(400, 'priority_order must be an object.')
  assertKnownKeys(order, CATEGORIES)
  if (CATEGORIES.some(key => !Number.isInteger(order[key]) || order[key] < 1 || order[key] > 3)
    || new Set(CATEGORIES.map(key => order[key])).size !== CATEGORIES.length) {
    throw new HttpError(400, 'Each recommendation priority must be unique from 1 to 3.')
  }
  const weights = body.custom_weights
  if (!isPlainObject(weights)) throw new HttpError(400, 'custom_weights must be an object.')
  assertKnownKeys(weights, CATEGORIES)
  if (CATEGORIES.some(key => !Number.isInteger(weights[key]) || weights[key] < 0 || weights[key] > 100)
    || CATEGORIES.every(key => weights[key] === 0)) {
    throw new HttpError(400, 'Choose weights from 0 to 100 and make at least one greater than zero.')
  }
  return { mode: body.mode, priority_order: order, custom_weights: weights }
}

export async function loadRecommendationSettings(db, userId) {
  const row = await db.prepare('SELECT settings, updated_at FROM recommendation_settings WHERE user_id = ?').bind(userId).first()
  return row ? { ...JSON.parse(row.settings), updatedAt: row.updated_at } : {
    mode: 'default', priority_order: DEFAULT_PRIORITY_ORDER, custom_weights: DEFAULT_WEIGHTS, updatedAt: null,
  }
}

export async function saveRecommendationSettings(db, userId, settings) {
  const updatedAt = Date.now()
  await db.prepare(`INSERT INTO recommendation_settings (user_id, settings, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`)
    .bind(userId, JSON.stringify(settings), updatedAt).run()
  return { ...settings, updatedAt }
}
