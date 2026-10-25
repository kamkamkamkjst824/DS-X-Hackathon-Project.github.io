// BU Dining API client plus deterministic menu filtering and ranking.
// Everything here is pure or takes its I/O (fetch, cache) as parameters so it can be unit tested.

export const BU_DINING_BASE = 'https://public.api-nonprod.bu.edu/api/v1/dining'
export const LOCATIONS = Object.freeze({
  marciano: 'Marciano Commons',
  warren: 'Warren Towers',
  west: 'West Campus',
})
export const LOCATION_IDS = Object.keys(LOCATIONS)
export const MEALS = ['Breakfast', 'Brunch', 'Lunch', 'Dinner']
export const TIME_ZONE = 'America/New_York'
// BU only publishes menus about a week ahead.
export const MAX_DAYS_AHEAD = 6
export const MAX_CANDIDATES = 120
export const MAX_RECOMMENDATIONS = 5
const MENU_CACHE_SECONDS = 600
const UPSTREAM_TIMEOUT_MS = 8000
const USER_AGENT = 'bu-dining-recommender/1.0 (Cloudflare Worker)'
// Toppings, condiments and build-your-own components are poor standalone recommendations.
const EXCLUDED_STATIONS = /condiment|\bcyo\b|salad bar/i

export class UpstreamError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Today's date (YYYY-MM-DD) in the dining time zone. */
export function todayInNewYork(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

async function getJson(url, { apiKey, fetcher, cache }) {
  // The BU gateway returns 403 for requests without a User-Agent, and Workers sends none by default.
  const request = new Request(url, { headers: { accept: 'application/json', 'x-api-key': apiKey, 'user-agent': USER_AGENT } })
  // The cache key deliberately omits the API key header.
  const cacheKey = new Request(url)
  if (cache) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit.json()
  }
  let response
  try {
    response = await fetcher(request, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch {
    throw new UpstreamError(504, 'BU Dining did not respond in time.')
  }
  if (!response.ok) throw new UpstreamError(response.status, `BU Dining returned ${response.status}.`)
  const data = await response.json()
  if (cache) {
    await cache.put(cacheKey, Response.json(data, { headers: { 'Cache-Control': `max-age=${MENU_CACHE_SECONDS}` } })).catch(() => {})
  }
  return data
}

export function fetchMenu(location, day, deps) {
  if (!LOCATION_IDS.includes(location)) throw new Error(`Unknown location: ${location}`)
  return getJson(`${BU_DINING_BASE}/locations/${location}/menu?day=${encodeURIComponent(day)}`, deps)
}

export function fetchItem(location, itemId, day, deps) {
  if (!LOCATION_IDS.includes(location)) throw new Error(`Unknown location: ${location}`)
  return getJson(`${BU_DINING_BASE}/locations/${location}/menu/items/${encodeURIComponent(itemId)}?day=${encodeURIComponent(day)}`, deps)
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Flattens one meal of a BU menu into simple item records. */
export function normalizeMeal(menu, location, mealName) {
  const meal = (menu?.meals || []).find(entry => entry?.name?.toLowerCase() === mealName.toLowerCase())
  if (!meal) return []
  const items = []
  const seen = new Set()
  for (const station of meal.stations || []) {
    if (!station?.name || EXCLUDED_STATIONS.test(station.name)) continue
    for (const item of station.items || []) {
      if (typeof item?.id !== 'string' || typeof item?.name !== 'string') continue
      // The same dish often appears at several stations; keep the first.
      const key = `${item.id}|${item.name.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        id: item.id,
        name: item.name.trim(),
        description: typeof item.description === 'string' ? item.description.trim() : null,
        location,
        meal: meal.name,
        station: station.name,
        calories: number(item.calories),
        carbs: number(item.carbohydrates_grams),
        protein: number(item.protein_grams),
        saturated_fat: number(item.saturated_fat_grams),
        vegetarian: item.vegetarian === true || item.vegan === true,
        vegan: item.vegan === true,
        gluten_free: item.gluten_free === true,
        halal: item.halal === true,
        cool_food: item.cool_food === true,
      })
    }
  }
  return items
}

/** Hard dietary and nutrition filters. These are never delegated to the LLM. */
export function filterItems(items, preferences) {
  return items.filter(item => {
    if (preferences.vegan && !item.vegan) return false
    if (preferences.vegetarian && !item.vegetarian) return false
    if (preferences.gluten_free && !item.gluten_free) return false
    if (preferences.halal && !item.halal) return false
    // Unknown nutrition values cannot satisfy an explicit nutrition goal.
    if (preferences.max_calories != null && (item.calories == null || item.calories > preferences.max_calories)) return false
    if (preferences.min_protein != null && (item.protein == null || item.protein < preferences.min_protein)) return false
    return true
  })
}

/** Caps the candidate list while keeping every location represented (round-robin). */
export function capCandidates(items, max = MAX_CANDIDATES) {
  if (items.length <= max) return items
  const groups = new Map()
  for (const item of items) {
    if (!groups.has(item.location)) groups.set(item.location, [])
    groups.get(item.location).push(item)
  }
  // Within each location, prefer items with complete nutrition data and more protein.
  for (const group of groups.values()) group.sort((a, b) => rankScore(b, []) - rankScore(a, []))
  const result = []
  for (let index = 0; result.length < max; index++) {
    let added = false
    for (const group of groups.values()) {
      if (index < group.length && result.length < max) {
        result.push(group[index])
        added = true
      }
    }
    if (!added) break
  }
  return result
}

const STOP_WORDS = new Set(['and', 'the', 'with', 'like', 'love', 'food', 'foods', 'any', 'not', 'but', 'for', 'some', 'really', 'very', 'prefer', 'enjoy', 'want', 'dont', "don't", 'eat'])

export function likeKeywords(likes) {
  return [...new Set(String(likes || '').toLowerCase().match(/[a-z]{3,}/g) || [])].filter(word => !STOP_WORDS.has(word)).slice(0, 20)
}

function matchedKeywords(item, keywords) {
  const text = `${item.name} ${item.description || ''} ${item.station}`.toLowerCase()
  // Allow simple plurals: "noodles" should match "noodle".
  return keywords.filter(word => text.includes(word) || (word.endsWith('s') && text.includes(word.slice(0, -1))))
}

function rankScore(item, keywords) {
  const matches = matchedKeywords(item, keywords).length
  const protein = item.protein ?? 0
  const density = item.calories ? protein / item.calories : 0
  const complete = item.calories != null && item.protein != null ? 1 : 0
  return matches * 100 + density * 100 + protein / 10 + complete
}

function describeNutrition(item) {
  const parts = []
  if (item.protein != null) parts.push(`${item.protein} g protein`)
  if (item.calories != null) parts.push(`${item.calories} kcal`)
  return parts.join(', ')
}

/** User-facing explanation for a rule-based pick, shared by rankItems and the AI fallback. */
export function recommendationReason(item, matched = []) {
  const nutrition = describeNutrition(item)
  const hits = matched.slice(0, 3)
  if (hits.length) return `Matches your interest in ${hits.join(', ')}${nutrition ? ` (${nutrition})` : ''}.`
  return `Fits your dietary settings${nutrition ? ` with ${nutrition}` : ''}.`
}

/** Rule-based ranking used before the LLM and as its fallback. */
export function rankItems(items, preferences, max = MAX_RECOMMENDATIONS) {
  const keywords = likeKeywords(preferences.likes)
  return [...items]
    .map(item => ({ item, score: rankScore(item, keywords), matches: matchedKeywords(item, keywords) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ item, matches }) => ({ item, reason: recommendationReason(item, matches) }))
}

/** Without a model verdict, the best location is the one serving the top-ranked pick. */
export function bestLocationFor(picks) {
  return picks[0]?.item.location ?? null
}
