import { HttpError, assertKnownKeys, isPlainObject } from './http.js'

// Daily nutrition targets (ported from the former Python userdata.py). Every field is optional.
export const NUTRITION_FIELDS = ['calories', 'carbs', 'protein', 'saturated_fat']
const MAX_VALUE = 100000

export function parseNutritionGoals(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Expected a JSON object.')
  assertKnownKeys(body, ['goals', 'goal_scope'])
  const goalScope = body.goal_scope ?? 'daily'
  if (!['daily', 'per-serving'].includes(goalScope)) throw new HttpError(400, 'goal_scope must be daily or per-serving.')
  const goals = body.goals
  if (!isPlainObject(goals)) throw new HttpError(400, 'goals must be a JSON object.')
  assertKnownKeys(goals, NUTRITION_FIELDS)
  const result = {}
  // Iterate the fixed field list so the stored order is stable.
  for (const field of NUTRITION_FIELDS) {
    if (goals[field] === undefined) continue
    const value = goals[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_VALUE) {
      throw new HttpError(400, `${field} must be a number between 0 and ${MAX_VALUE}.`)
    }
    result[field] = value
  }
  return { goals: result, goalScope }
}

export async function loadNutritionGoals(db, userId) {
  const row = await db.prepare('SELECT goals, goal_scope, updated_at FROM nutrition_preferences WHERE user_id = ?').bind(userId).first()
  return { goals: row ? JSON.parse(row.goals) : {}, goalScope: row?.goal_scope ?? 'daily', updatedAt: row?.updated_at ?? null }
}

export async function saveNutritionGoals(db, userId, { goals, goalScope }) {
  const updatedAt = Date.now()
  await db.prepare(`INSERT INTO nutrition_preferences (user_id, goals, goal_scope, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET goals = excluded.goals, goal_scope = excluded.goal_scope, updated_at = excluded.updated_at`)
    .bind(userId, JSON.stringify(goals), goalScope, updatedAt).run()
  return { goals, goalScope, updatedAt }
}
