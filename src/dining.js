import { request } from './api.js'

export const LOCATIONS = [
  { id: 'marciano', name: 'Marciano Commons' },
  { id: 'warren', name: 'Warren Towers' },
  { id: 'west', name: 'West Campus' },
]
export const MEALS = ['current', 'Breakfast', 'Brunch', 'Lunch', 'Dinner']
// Must match MAX_DAYS_AHEAD in the Worker.
export const MAX_DAYS_AHEAD = 6

export const DEFAULT_PREFERENCES = Object.freeze({
  vegetarian: false,
  vegan: false,
  gluten_free: false,
  halal: false,
  max_calories: null,
  min_protein: null,
  likes: '',
})

export function getPreferences(token) {
  return request('/api/preferences', { token })
}

export function savePreferences(token, preferences) {
  return request('/api/preferences', { method: 'PUT', token, body: preferences })
}

// The Worker fetches up to three menus, calls Workers AI and loads item details, so allow longer.
export function getRecommendations(token, { date, meal, locations }) {
  return request('/api/recommend', { method: 'POST', token, body: { date, meal, locations }, timeout: 45000 })
}

/** YYYY-MM-DD in America/New_York, offset by whole days. */
export function diningDate(offsetDays = 0, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}
