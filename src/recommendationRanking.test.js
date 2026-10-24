import { describe, expect, it } from 'vitest'
import { rankRecommendations } from './recommendationRanking.js'

const dishes = [
  {
    item_id: 'liked',
    name: 'Chicken Bowl',
    location: { id: 'west', name: 'West Campus' },
    nutrition: { calories: 900 },
    tags: { halal: true, vegan: false, vegetarian: false, gluten_free: false },
  },
  {
    item_id: 'nutrition-location-first',
    name: 'Tofu Bowl',
    location: { id: 'marciano', name: 'Marciano Commons' },
    nutrition: { calories: 500 },
    tags: { halal: true, vegan: true, vegetarian: true, gluten_free: false },
  },
  {
    item_id: 'nutrition-location-last',
    name: 'Rice Bowl',
    location: { id: 'warren', name: 'Warren Towers' },
    nutrition: { calories: 510 },
    tags: { halal: true, vegan: false, vegetarian: false, gluten_free: false },
  },
  {
    item_id: 'diet-fails',
    name: 'Chicken Sandwich',
    location: { id: 'warren', name: 'Warren Towers' },
    nutrition: { calories: 500 },
    tags: { halal: false, vegan: false, vegetarian: false, gluten_free: false },
  },
]

describe('rankRecommendations', () => {
  it('uses the selected nutrition, food, and location priority order', () => {
    const result = rankRecommendations(dishes, {
      preferences: { halal: true, likes: 'chicken' },
      nutritionGoals: { calories: 500 },
      locationRanks: { marciano: 1, west: 2, warren: 3 },
      priorityOrder: { nutrition: 1, food: 2, location: 3 },
    })

    expect(result.recommendations.map(dish => dish.item_id)).toEqual([
      'nutrition-location-first',
      'nutrition-location-last',
      'liked',
    ])
    expect(result.recommendations[0].preferenceMatch.nutrition.fits).toBe(true)
    expect(result.recommendations[2].preferenceMatch.nutrition.fits).toBe(false)
    expect(result.foundKeywords).toEqual(['chicken'])
    expect(result.missingKeywords).toEqual([])
  })

  it('does not penalize a missing keyword and reports it for alternatives', () => {
    const result = rankRecommendations(dishes, {
      preferences: { halal: true, likes: 'ramen' },
      nutritionGoals: {},
      locationRanks: { marciano: 1, west: 2, warren: 3 },
    })

    expect(result.recommendations.map(dish => dish.item_id)).toEqual([
      'nutrition-location-first',
      'liked',
      'nutrition-location-last',
    ])
    expect(result.missingKeywords).toEqual(['ramen'])
  })

  it('requires every selected dietary label and accepts vegan as vegetarian', () => {
    const result = rankRecommendations(dishes, {
      preferences: { vegetarian: true, halal: true },
    })

    expect(result.recommendations.map(dish => dish.item_id)).toEqual(['nutrition-location-first'])
  })

  it('ranks closer nutrition values ahead of better location ranks', () => {
    const result = rankRecommendations(dishes.slice(1, 3), {
      nutritionGoals: { calories: 500 },
      locationRanks: { marciano: 3, warren: 1 },
    })

    expect(result.recommendations.map(dish => dish.item_id)).toEqual([
      'nutrition-location-first',
      'nutrition-location-last',
    ])
  })

  it('lets food keywords outrank nutrition when the user selects them first', () => {
    const result = rankRecommendations(dishes.slice(0, 2), {
      preferences: { likes: 'chicken' },
      nutritionGoals: { calories: 500 },
      priorityOrder: { food: 1, location: 2, nutrition: 3 },
    })

    expect(result.recommendations.map(dish => dish.item_id)).toEqual([
      'liked',
      'nutrition-location-first',
    ])
  })

  it('lets location preference outrank nutrition when selected first', () => {
    const result = rankRecommendations(dishes.slice(1, 3), {
      nutritionGoals: { calories: 500 },
      locationRanks: { marciano: 3, warren: 1 },
      priorityOrder: { food: 2, location: 1, nutrition: 3 },
    })

    expect(result.recommendations.map(dish => dish.item_id)).toEqual([
      'nutrition-location-last',
      'nutrition-location-first',
    ])
  })

  it('treats values within 25% as matching and ranks them above keyword hits outside the range', () => {
    const result = rankRecommendations([
      {
        ...dishes[0],
        nutrition: { calories: 626 },
      },
      {
        ...dishes[1],
        name: 'Chicken Tofu Bowl',
        nutrition: { calories: 625 },
      },
    ], {
      preferences: { likes: 'chicken' },
      nutritionGoals: { calories: 500 },
    })

    expect(result.recommendations.map(dish => dish.item_id)).toEqual([
      'nutrition-location-first',
      'liked',
    ])
    expect(result.recommendations[0].preferenceMatch.nutrition.fits).toBe(true)
    expect(result.recommendations[1].preferenceMatch.nutrition.fits).toBe(false)
  })
})
