import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scoreCandidates } from '../src/scoring.js'
import { DEFAULT_PRIORITY_ORDER, DEFAULT_WEIGHTS, parseRecommendationSettings } from '../src/recommendation-settings.js'

const settings = { mode: 'default', priority_order: DEFAULT_PRIORITY_ORDER, custom_weights: DEFAULT_WEIGHTS }
const dish = (id, name, location, calories) => ({ id, name, location, calories, carbs: 40, protein: 20, saturated_fat: 4, description: '' })

test('default weights follow saved priority order and normalize unfilled preferences', () => {
  const result = scoreCandidates([dish('a', 'Chicken bowl', 'west', 500), dish('b', 'Tofu bowl', 'warren', 600)], {
    preferences: { likes: 'chicken' }, goals: {}, locationRanks: { west: 2, warren: 1 },
    settings: { ...settings, priority_order: { food: 1, location: 2, nutrition: 3 } },
  })
  assert.deepEqual(result.weights, { food: 56.3, location: 43.7, nutrition: 0 })
  assert.equal(result.items[0].id, 'a')
})

test('advanced weights rank dishes by weighted nutrition, food and location scores', () => {
  const result = scoreCandidates([dish('a', 'Chicken bowl', 'warren', 1000), dish('b', 'Tofu bowl', 'west', 500)], {
    preferences: { likes: 'tofu' }, goals: { calories: 500 },
    locationRanks: { warren: 1, west: 3 },
    settings: { mode: 'advanced', priority_order: DEFAULT_PRIORITY_ORDER, custom_weights: { nutrition: 100, food: 0, location: 0 } },
  })
  assert.equal(result.items[0].id, 'b')
  assert.equal(result.items[0].scores.nutrition, 100)
  assert.equal(result.weights.nutrition, 100)
})

test('missing nutrition values are omitted instead of treated as zero', () => {
  const result = scoreCandidates([dish('a', 'Chicken bowl', 'west', null), dish('b', 'Rice bowl', 'west', 500)], {
    preferences: {}, goals: { calories: 500 }, locationRanks: { west: 1 }, settings,
  })
  assert.deepEqual(result.items.map(item => item.id), ['b'])
  assert.equal(result.missingNutrition, 1)
})

test('AI keywords activate food scoring for non-English likes', () => {
  const interpretation = { keywords: ['spicy', 'chicken'], include: [], exclude: [], flavors: ['spicy'] }
  const input = {
    preferences: { likes: '想吃辣的鸡肉' }, goals: {}, locationRanks: {}, settings,
  }
  const withAi = scoreCandidates([dish('a', 'Spicy Chicken Bowl', 'west', 500)], { ...input, interpretation })
  assert.equal(withAi.items[0].scores.food, 100)
  assert.ok(withAi.weights.food > 0)
  assert.deepEqual(withAi.items[0].matched_keywords, ['spicy', 'chicken'])

  // Without interpretation the same Chinese text yields no usable keyword and the dimension is inactive.
  const literal = scoreCandidates([dish('a', 'Spicy Chicken Bowl', 'west', 500)], input)
  assert.equal(literal.weights.food, 0)
  assert.equal(literal.items[0].scores.food, null)
})

test('avoided terms demote but never remove a dish', () => {
  const result = scoreCandidates([dish('a', 'Fried Chicken', 'west', 500), dish('b', 'Grilled Chicken', 'west', 500)], {
    preferences: { likes: 'chicken' }, goals: {}, locationRanks: {}, settings,
    interpretation: { keywords: ['chicken'], include: [], exclude: ['fried'], flavors: [] },
  })
  const fried = result.items.find(item => item.id === 'a')
  const grilled = result.items.find(item => item.id === 'b')
  assert.equal(result.items.length, 2)
  assert.equal(fried.scores.food, 25)
  assert.equal(grilled.scores.food, 100)
  assert.deepEqual(fried.avoided_terms, ['fried'])
  assert.deepEqual(grilled.avoided_terms, [])
})

test('recommendation settings validation rejects duplicate priorities and empty weights', () => {
  const valid = { mode: 'advanced', priority_order: DEFAULT_PRIORITY_ORDER, custom_weights: { nutrition: 0, food: 50, location: 50 } }
  assert.deepEqual(parseRecommendationSettings(valid), valid)
  assert.throws(() => parseRecommendationSettings({ ...valid, priority_order: { nutrition: 1, food: 1, location: 3 } }), error => error.status === 400)
  assert.throws(() => parseRecommendationSettings({ ...valid, custom_weights: { nutrition: 0, food: 0, location: 0 } }), error => error.status === 400)
})
