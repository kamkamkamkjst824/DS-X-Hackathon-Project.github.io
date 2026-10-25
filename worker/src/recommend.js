import { HttpError, assertKnownKeys, isPlainObject } from './http.js'
import {
  LOCATIONS, LOCATION_IDS, MAX_DAYS_AHEAD, MAX_RECOMMENDATIONS, MEALS,
  bestLocationFor, daysBetween, fetchItem, fetchMenu, filterItems,
  isValidDate, normalizeMeal, todayInNewYork,
} from './dining.js'
import { buildCandidates, buildMessages, parseModelOutput, runModel } from './llm.js'
import { DEFAULT_PRIORITY_ORDER, DEFAULT_WEIGHTS } from './recommendation-settings.js'
import { scoreCandidates } from './scoring.js'

const DEFAULT_ALLERGY_NOTICE = 'Menus and ingredients can change. If you have a food allergy, speak with BU Dining staff before ordering.'

/** Validates { date?, meal, locations? }. `meal` may be "current" for whatever is being served now. */
export function parseRecommendRequest(body, now = new Date()) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Please submit the request as a JSON object.')
  assertKnownKeys(body, ['date', 'meal', 'locations'])
  const today = todayInNewYork(now)
  const date = body.date ?? today
  if (!isValidDate(date)) throw new HttpError(400, 'Please choose a valid date (YYYY-MM-DD).')
  const offset = daysBetween(today, date)
  if (offset < 0 || offset > MAX_DAYS_AHEAD) {
    throw new HttpError(400, `Menus are available from today up to ${MAX_DAYS_AHEAD} days ahead.`)
  }
  const meal = typeof body.meal === 'string'
    ? (body.meal.toLowerCase() === 'current' ? 'current' : MEALS.find(name => name.toLowerCase() === body.meal.toLowerCase()))
    : undefined
  if (!meal) throw new HttpError(400, `Please choose a meal: ${MEALS.join(', ')} or current.`)
  if (meal === 'current' && date !== today) throw new HttpError(400, '"Now" is only available for today.')
  let locations = LOCATION_IDS
  if (body.locations !== undefined) {
    if (!Array.isArray(body.locations) || !body.locations.length || body.locations.length > LOCATION_IDS.length
      || !body.locations.every(id => LOCATION_IDS.includes(id))) {
      throw new HttpError(400, `Please choose one or more dining halls: ${LOCATION_IDS.join(', ')}.`)
    }
    // Keep a stable order and drop duplicates.
    locations = LOCATION_IDS.filter(id => body.locations.includes(id))
  }
  return { date, meal, locations }
}

function locationInfo(id) {
  return { id, name: LOCATIONS[id] }
}

function present(item, reason, detail) {
  return {
    item_id: item.id,
    name: item.name,
    description: item.description,
    location: locationInfo(item.location),
    meal: item.meal,
    station: item.station,
    nutrition: {
      calories: item.calories,
      carbs_grams: item.carbs,
      protein_grams: item.protein,
      saturated_fat_grams: item.saturated_fat,
    },
    tags: {
      vegetarian: item.vegetarian,
      vegan: item.vegan,
      gluten_free: item.gluten_free,
      halal: item.halal,
      cool_food: item.cool_food,
    },
    reason,
    ingredients: typeof detail?.ingredients === 'string' ? detail.ingredients : null,
    allergy_notice: typeof detail?.allergy_notice === 'string' ? detail.allergy_notice : DEFAULT_ALLERGY_NOTICE,
    source_url: typeof detail?.source_url === 'string' && detail.source_url.startsWith('https://www.bu.edu/') ? detail.source_url : null,
    details_available: Boolean(detail),
    score: item.score,
    score_breakdown: item.scores,
    score_weights: item.weights,
    recommendation_source: item.recommendation_source,
  }
}

/**
 * Full recommendation pipeline:
 * menus (parallel) → normalize → hard filters → cap → LLM rank (validated, with rule-based fallback) → item details.
 * deps: { apiKey, fetcher, cache, ai, log }
 */
export async function recommend({ preferences, goals = {}, goalScope = 'daily', locationRanks = {}, settings = {
  mode: 'default', priority_order: DEFAULT_PRIORITY_ORDER, custom_weights: DEFAULT_WEIGHTS,
}, date, meal, locations }, deps) {
  const warnings = []
  const menus = await Promise.allSettled(locations.map(id => fetchMenu(id, date, deps)))
  const summaries = []
  let candidates = []
  menus.forEach((result, index) => {
    const id = locations[index]
    if (result.status === 'rejected') {
      deps.log?.('menu fetch failed', id, result.reason?.message)
      warnings.push(`${LOCATIONS[id]} menu is unavailable right now.`)
      return
    }
    const menu = result.value
    const mealName = meal === 'current' ? menu.current_meal : meal
    if (menu.stale) warnings.push(`${LOCATIONS[id]} menu may be out of date.`)
    if (!mealName) {
      warnings.push(`${LOCATIONS[id]} is not serving a meal right now.`)
      summaries.push({ ...locationInfo(id), meal: null, open_now: menu.open_now === true, status: String(menu.status ?? ''), served: 0, matching: 0 })
      return
    }
    const served = normalizeMeal(menu, id, mealName)
    const matching = filterItems(served, { ...preferences, max_calories: null, min_protein: null })
    if (!served.length) warnings.push(`${LOCATIONS[id]} has no ${mealName} menu for this day.`)
    summaries.push({ ...locationInfo(id), meal: mealName, open_now: menu.open_now === true, status: String(menu.status ?? ''), served: served.length, matching: matching.length })
    candidates.push(...matching)
  })
  if (menus.every(result => result.status === 'rejected')) {
    throw new HttpError(502, 'Unable to load dining menus right now. Please try again later.')
  }

  const base = { date, meal, locations: summaries, warnings, model: null, fallback: false, score_version: 1, score_weights: null }
  if (!candidates.length) {
    return {
      ...base,
      best_location: null,
      summary: 'No menu items match your dietary settings for this meal. Try relaxing a filter or choosing another meal.',
      recommendations: [],
    }
  }

  const scored = scoreCandidates(candidates, { preferences, goals: goalScope === 'per-serving' ? goals : {}, locationRanks, settings })
  candidates = scored.items.slice(0, 20)
  base.score_weights = scored.weights
  if (goalScope !== 'per-serving' && Object.keys(goals).length) warnings.push('Daily nutrition targets were not used; save per-serving targets to include nutrition in scoring.')
  if (scored.missingNutrition) warnings.push(`${scored.missingNutrition} dish(es) were omitted because nutrition data was incomplete for your selected goals.`)
  if (!candidates.length) return { ...base, best_location: null, summary: 'No dishes have enough nutrition data to score against your selected goals.', recommendations: [] }
  const candidateLocations = [...new Set(candidates.map(item => item.location))]
  let ranked = null
  if (deps.ai) {
    const { lines, byRef } = buildCandidates(candidates)
    try {
      const output = await runModel(deps.ai, {
        messages: buildMessages({ preferences, goals: goalScope === 'per-serving' ? goals : {}, weights: scored.weights, meal: meal === 'current' ? 'whatever is being served now' : meal, date, lines }),
        locationIds: candidateLocations,
      })
      ranked = parseModelOutput(output, byRef, candidateLocations)
      if (!ranked) deps.log?.('model output unusable')
    } catch (error) {
      deps.log?.('model call failed', error?.message)
    }
  }

  const fallbackPicks = candidates.slice(0, MAX_RECOMMENDATIONS).map(item => ({ item, reason: 'Ranked by your preference weights.' }))
  let picks
  let summary
  let bestLocation
  if (ranked) {
    // Top up with rule-based picks if the model returned fewer than requested.
    picks = [...ranked.picks]
    for (const pick of fallbackPicks) {
      if (picks.length >= MAX_RECOMMENDATIONS) break
      if (!picks.some(existing => existing.item === pick.item)) picks.push(pick)
    }
    bestLocation = picks[0].item.location
    summary = ranked.summary
    base.model = 'workers-ai'
  } else {
    picks = fallbackPicks
    bestLocation = bestLocationFor(picks)
    base.fallback = true
  }
  const aiItems = new Set(ranked?.picks.map(pick => pick.item) || [])
  summary ||= `${LOCATIONS[bestLocation]} looks like your best option for this meal.`

  picks = picks.map(pick => ({ ...pick, item: { ...pick.item, recommendation_source: aiItems.has(pick.item) ? 'AI' : 'Weighted score' } }))
  const details = await Promise.allSettled(picks.map(({ item }) => fetchItem(item.location, item.id, date, deps)))
  const recommendations = picks.map(({ item, reason }, index) => {
    const detail = details[index].status === 'fulfilled' ? details[index].value : null
    if (!detail) deps.log?.('item detail failed', item.location, item.id)
    return present(item, reason, detail)
  })
  if (details.some(result => result.status === 'rejected')) {
    warnings.push('Some ingredient details could not be loaded.')
  }
  return { ...base, best_location: locationInfo(bestLocation), summary, recommendations }
}
