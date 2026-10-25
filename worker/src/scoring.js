import { likeKeywords } from './dining.js'

const GOAL_KEYS = { calories: 'calories', carbs: 'carbs', protein: 'protein', saturated_fat: 'saturated_fat' }

function nutritionScore(item, goals) {
  const values = Object.entries(goals).map(([key, target]) => {
    const value = item[GOAL_KEYS[key]]
    if (value == null) return null
    return target === 0 ? (value === 0 ? 100 : 0) : 100 * Math.max(0, 1 - Math.abs(value - target) / target)
  })
  return values.some(value => value === null) ? null
    : values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function foodScore(item, keywords) {
  if (!keywords.length) return null
  const text = `${item.name} ${item.description || ''}`.toLowerCase()
  const matched = keywords.filter(word => text.includes(word) || (word.endsWith('s') && text.includes(word.slice(0, -1))))
  return { score: 100 * matched.length / keywords.length, matched }
}

export function scoreCandidates(items, { preferences, goals, locationRanks, settings }) {
  const order = settings.priority_order || { nutrition: 1, food: 2, location: 3 }
  const defaults = Object.fromEntries(Object.entries(order).map(([key, rank]) => [key, [45, 35, 20][rank - 1]]))
  const requested = settings.mode === 'advanced' ? settings.custom_weights : defaults
  const active = {
    nutrition: goals && Object.keys(goals).length > 0,
    food: Boolean(preferences.likes?.trim()),
    location: true,
  }
  const raw = Object.fromEntries(Object.entries(requested).map(([key, value]) => [key, active[key] ? value : 0]))
  let totalWeight = Object.values(raw).reduce((sum, value) => sum + value, 0)
  if (!totalWeight) { raw.location = 1; totalWeight = 1 }
  const weights = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, totalWeight ? value / totalWeight : 0]))
  const needsNutrition = active.nutrition && weights.nutrition > 0
  const keywords = likeKeywords(preferences.likes)
  let missingNutrition = 0
  const ranked = items.flatMap(item => {
    const nutrition = needsNutrition ? nutritionScore(item, goals) : null
    if (needsNutrition && nutrition === null) { missingNutrition += 1; return [] }
    const food = foodScore(item, keywords)
    const locationRank = locationRanks[item.location]
    const location = locationRank ? [100, 50, 0][locationRank - 1] : 0
    const scores = { nutrition, food: food?.score ?? null, location }
    const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + (weight ? scores[key] * weight : 0), 0)
    return [{ ...item, score, scores, weights, matched_keywords: food?.matched || [] }]
  }).sort((a, b) => b.score - a.score || (locationRanks[a.location] || 99) - (locationRanks[b.location] || 99) || a.id.localeCompare(b.id))
  const displayed = Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.round(value * 1000) / 10]))
  const last = Object.keys(weights).findLast(key => weights[key] > 0)
  if (last) displayed[last] = Math.round((100 - Object.entries(displayed).reduce((sum, [key, value]) => sum + (key === last ? 0 : value), 0)) * 10) / 10
  return { items: ranked, weights: displayed, missingNutrition }
}
