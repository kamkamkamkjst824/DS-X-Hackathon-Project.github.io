import { request } from './api.js'

const DIETS = [
  { key: 'vegan', label: 'Vegan' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'gluten_free', label: 'Gluten-free' },
  { key: 'halal', label: 'Halal' },
]

const NUTRIENTS = [
  { key: 'calories', itemKey: 'calories', label: 'Calories' },
  { key: 'carbs', itemKey: 'carbs_grams', label: 'Carbohydrates' },
  { key: 'protein', itemKey: 'protein_grams', label: 'Protein' },
  { key: 'saturated_fat', itemKey: 'saturated_fat_grams', label: 'Saturated fat' },
]
export const NUTRITION_TOLERANCE = 0.25
export const DEFAULT_PRIORITY_ORDER = Object.freeze({
  nutrition: 1,
  food: 2,
  location: 3,
})
const PRIORITY_STORAGE_KEY = 'recommendationPriorities'

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

function getDietaryNeeds(preferences) {
  return DIETS.filter(({ key }) => preferences?.[key])
}

function getKeywords(likes) {
  if (typeof likes !== 'string') return []
  const keywords = likes.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean)
  return keywords.filter((keyword, index) => (
    keywords.findIndex(value => normalize(value) === normalize(keyword)) === index
  ))
}

function matchesKeyword(name, keyword) {
  const normalizedName = normalize(name)
  const normalizedKeyword = normalize(keyword)
  if (normalizedName.includes(normalizedKeyword)) return true
  return normalizedKeyword.split(/\s+/).some(word => word.length > 2 && normalizedName.split(/\W+/).includes(word))
}

function getNutritionGoals(goals) {
  if (!goals || typeof goals !== 'object' || Array.isArray(goals)) return []
  return NUTRIENTS.flatMap(nutrient => {
    const value = goals[nutrient.key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return []
    return [{ ...nutrient, value }]
  })
}

function satisfiesDietaryNeeds(item, dietaryNeeds) {
  return dietaryNeeds.every(({ key }) => {
    if (key === 'vegetarian' && item.tags?.vegan) return true
    return item.tags?.[key] === true
  })
}

function getNutritionMatch(item, goals) {
  let matches = 0
  let distance = 0
  for (const goal of goals) {
    const value = item.nutrition?.[goal.itemKey]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      distance = Infinity
      continue
    }
    const difference = Math.abs(value - goal.value)
    const tolerance = goal.value * NUTRITION_TOLERANCE
    if (difference <= tolerance) matches += 1
    distance += goal.value === 0 ? (value === 0 ? 0 : Infinity) : difference / goal.value
  }
  return {
    matches,
    fits: goals.length > 0 && matches === goals.length,
    total: goals.length,
    distance,
  }
}

function compareNutrition(first, second) {
  if (first.nutrition.fits !== second.nutrition.fits) {
    return Number(second.nutrition.fits) - Number(first.nutrition.fits)
  }
  if (first.nutrition.matches !== second.nutrition.matches) {
    return second.nutrition.matches - first.nutrition.matches
  }
  if (first.nutrition.distance < second.nutrition.distance) return -1
  if (first.nutrition.distance > second.nutrition.distance) return 1
  return 0
}

function compareRanked(first, second, priorityOrder) {
  const comparators = {
    nutrition: () => compareNutrition(first, second),
    food: () => second.keywordMatches - first.keywordMatches,
    location: () => (
      (first.locationRank ?? Number.MAX_SAFE_INTEGER)
      - (second.locationRank ?? Number.MAX_SAFE_INTEGER)
    ),
  }
  for (const category of Object.keys(priorityOrder).sort((a, b) => priorityOrder[a] - priorityOrder[b])) {
    const comparison = comparators[category]()
    if (comparison !== 0) return comparison
  }
  return first.originalIndex - second.originalIndex
}

export function rankRecommendations(recommendations, {
  preferences = {},
  nutritionGoals = {},
  locationRanks = {},
  priorityOrder = DEFAULT_PRIORITY_ORDER,
} = {}) {
  const dietaryNeeds = getDietaryNeeds(preferences)
  const keywords = getKeywords(preferences.likes)
  const goals = getNutritionGoals(nutritionGoals)
  const eligible = recommendations.filter(item => satisfiesDietaryNeeds(item, dietaryNeeds))
  const foundKeywords = keywords.filter(keyword => eligible.some(item => matchesKeyword(item.name, keyword)))
  const missingKeywords = keywords.filter(keyword => !foundKeywords.includes(keyword))
  const ranked = eligible.map((item, originalIndex) => {
    const keywordMatches = foundKeywords.filter(keyword => matchesKeyword(item.name, keyword)).length
    const savedLocationRank = Number(locationRanks[item.location?.id])
    return {
      ...item,
      preferenceMatch: {
        keywordMatches,
        keywordTotal: foundKeywords.length,
        nutrition: getNutritionMatch(item, goals),
        locationRank: Number.isInteger(savedLocationRank) && savedLocationRank > 0 ? savedLocationRank : null,
      },
      originalIndex,
    }
  }).sort((first, second) => compareRanked(
    {
      keywordMatches: first.preferenceMatch.keywordMatches,
      nutrition: first.preferenceMatch.nutrition,
      locationRank: first.preferenceMatch.locationRank,
      originalIndex: first.originalIndex,
    },
    {
      keywordMatches: second.preferenceMatch.keywordMatches,
      nutrition: second.preferenceMatch.nutrition,
      locationRank: second.preferenceMatch.locationRank,
      originalIndex: second.originalIndex,
    },
    priorityOrder
  )).map(({ originalIndex, ...item }) => item)

  return {
    recommendations: ranked,
    dietaryNeeds,
    keywords,
    foundKeywords,
    missingKeywords,
    nutritionGoals: goals,
    locationRanks,
  }
}

export async function readNutritionGoals(token) {
  const { goals } = await request('/api/nutrition-preferences', { token })
  if (!goals || typeof goals !== 'object' || Array.isArray(goals)) {
    throw new Error('Saved nutrition preferences are invalid. Reset and save them again.')
  }
  return goals
}

export function readPriorityOrder(storage = globalThis.localStorage) {
  const saved = storage.getItem(PRIORITY_STORAGE_KEY)
  if (!saved) return { ...DEFAULT_PRIORITY_ORDER }

  const stored = JSON.parse(saved)
  const categories = Object.keys(DEFAULT_PRIORITY_ORDER)
  if (
    !stored?.order
    || typeof stored.order !== 'object'
    || Array.isArray(stored.order)
    || categories.some(category => !Number.isInteger(stored.order[category]) || stored.order[category] < 1 || stored.order[category] > categories.length)
    || new Set(categories.map(category => stored.order[category])).size !== categories.length
  ) {
    throw new Error('Saved recommendation priorities are invalid. Choose each priority from 1 to 3 and save again.')
  }
  return Object.fromEntries(categories.map(category => [category, stored.order[category]]))
}

export async function readLocationRanks(token) {
  const result = await request('/api/location-preferences', { token })
  if (!Array.isArray(result.preferences)) {
    throw new Error('Saved dining location preferences have an unexpected format.')
  }

  return Object.fromEntries(
    result.preferences
      .filter(item => typeof item.location === 'string' && Number.isInteger(item.rank))
      .map(item => [item.location, item.rank])
  )
}
