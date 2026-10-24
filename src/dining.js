import { ApiError, request } from './api.js'

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

export async function getDiningMenus({ date, meal, locations, token }) {
  const results = await Promise.allSettled(locations.map(async location => {
    const query = new URLSearchParams({ day: date })
    const menu = await request(`/api/v1/dining/locations/${encodeURIComponent(location)}/menu?${query}`, {
      token, timeout: 30000,
    })
    if (!Array.isArray(menu.meals)) {
      throw new Error(`${location}: BU Dining API returned an unexpected menu format.`)
    }

    const selectedMeal = meal.toLocaleLowerCase() === 'current'
      ? menu.current_meal?.toLocaleLowerCase()
      : meal.toLocaleLowerCase()
    const meals = menu.meals.filter(entry => entry.name.toLocaleLowerCase() === selectedMeal)
    const items = meals.flatMap(mealEntry => mealEntry.stations.flatMap(station => (
      station.items.map(item => ({
        item_id: item.id,
        name: item.name,
        description: item.description,
        location: menu.location,
        meal: mealEntry.name,
        station: station.name,
        reason: 'Matched against the saved dietary, food, nutrition, and location preferences.',
        nutrition: {
          calories: item.calories,
          protein_grams: item.protein_grams,
          carbs_grams: item.carbohydrates_grams,
          saturated_fat_grams: item.saturated_fat_grams,
        },
        tags: {
          vegetarian: item.vegetarian,
          vegan: item.vegan,
          gluten_free: item.gluten_free,
          halal: item.halal,
          cool_food: item.cool_food,
        },
        ingredients: null,
        allergy_notice: 'Menu and ingredient information can change. Contact BU Dining staff about allergies.',
        source_url: menu.source_url,
        details_available: false,
        stale: menu.stale,
      }))
    )))
    return { location: menu.location, items, stale: menu.stale, sourceUrl: menu.source_url }
  }))

  const expired = results.find(result => result.status === 'rejected'
    && result.reason instanceof ApiError && result.reason.status === 401)
  if (expired) throw expired.reason

  const menus = results.flatMap((result, index) => result.status === 'fulfilled'
    ? [result.value]
    : [{ error: result.reason instanceof Error ? result.reason.message : `${locations[index]}: menu unavailable.` }])
  const availableMenus = menus.filter(menu => !menu.error)
  if (availableMenus.length === 0) {
    throw new Error([...new Set(menus.map(menu => menu.error))].join(' '))
  }

  return {
    recommendations: availableMenus.flatMap(menu => menu.items),
    warnings: menus.filter(menu => menu.error).map(menu => menu.error),
    staleLocations: availableMenus.filter(menu => menu.stale).map(menu => menu.location.name),
    sourceUrls: [...new Set(availableMenus.map(menu => menu.sourceUrl))],
  }
}

/** YYYY-MM-DD in America/New_York, offset by whole days. */
export function diningDate(offsetDays = 0, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}
