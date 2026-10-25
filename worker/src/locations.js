import { HttpError, assertKnownKeys, isPlainObject } from './http.js'

export function parseLocationPreferences(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Expected a JSON object.')
  assertKnownKeys(body, ['preferences'])
  const items = body.preferences
  if (!Array.isArray(items) || items.length > 3) throw new HttpError(400, 'Provide up to three ranked dining locations.')
  const ranks = new Set()
  const locations = new Set()
  for (const item of items) {
    if (!isPlainObject(item)) throw new HttpError(400, 'Invalid location preference.')
    assertKnownKeys(item, ['rank', 'location'])
    if (!Number.isInteger(item.rank) || item.rank < 1 || item.rank > 3 ||
        !['warren', 'west', 'marciano'].includes(item.location) ||
        ranks.has(item.rank) || locations.has(item.location)) {
      throw new HttpError(400, 'Locations and ranks must be valid and unique.')
    }
    ranks.add(item.rank)
    locations.add(item.location)
  }
  return [...items].sort((a, b) => a.rank - b.rank)
}

export async function loadLocations(db, userId) {
  const row = await db.prepare('SELECT preferences FROM location_preferences WHERE user_id = ?').bind(userId).first()
  return { preferences: row ? JSON.parse(row.preferences) : [] }
}

export async function saveLocations(db, userId, preferences) {
  await db.prepare(`INSERT INTO location_preferences (user_id, preferences) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET preferences = excluded.preferences`)
    .bind(userId, JSON.stringify(preferences)).run()
  return { preferences }
}
