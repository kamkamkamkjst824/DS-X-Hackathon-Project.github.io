import { request } from './api.js'

export const DEFAULT_PRIORITY_ORDER = Object.freeze({ nutrition: 1, food: 2, location: 3 })
const PRIORITY_STORAGE_KEY = 'recommendationPriorities'

export function readPriorityOrder(storage = globalThis.localStorage) {
  const saved = storage.getItem(PRIORITY_STORAGE_KEY)
  if (!saved) return { ...DEFAULT_PRIORITY_ORDER }
  const order = JSON.parse(saved).order
  const categories = Object.keys(DEFAULT_PRIORITY_ORDER)
  if (!order || typeof order !== 'object' || Array.isArray(order)
    || categories.some(key => !Number.isInteger(order[key]) || order[key] < 1 || order[key] > 3)
    || new Set(categories.map(key => order[key])).size !== categories.length) {
    throw new Error('Saved recommendation priorities are invalid. Choose each priority from 1 to 3 and save again.')
  }
  return Object.fromEntries(categories.map(key => [key, order[key]]))
}

export async function readLocationRanks(token) {
  const result = await request('/api/location-preferences', { token })
  if (!Array.isArray(result.preferences)) throw new Error('Saved dining location preferences have an unexpected format.')
  return Object.fromEntries(result.preferences
    .filter(item => typeof item.location === 'string' && Number.isInteger(item.rank))
    .map(item => [item.location, item.rank]))
}
