import { afterEach, describe, expect, it, vi } from 'vitest'
import { diningDate, getDiningMenus } from './dining.js'
import { API_BASE } from './api.js'

afterEach(() => vi.unstubAllGlobals())

function menu(location, meals, overrides = {}) {
  return {
    location: { id: location, name: `${location} Dining`, source_url: `https://bu.edu/${location}` },
    date: '2026-10-24',
    meals,
    open_now: true,
    status: 'open',
    current_meal: 'Lunch',
    source_url: `https://bu.edu/${location}`,
    fetched_at: '2026-10-24T12:00:00Z',
    stale: false,
    ...overrides,
  }
}

describe('getDiningMenus', () => {
  it('loads BU Dining menus and normalizes selected meal items', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(menu('warren', [
      {
        name: 'Lunch',
        stations: [{
          name: 'Grill',
          items: [{
            id: 'item-1',
            name: 'Veggie Bowl',
            calories: 450,
            carbohydrates_grams: 40,
            protein_grams: 18,
            saturated_fat_grams: 2,
            vegan: true,
            vegetarian: true,
            gluten_free: true,
            halal: false,
          }],
        }],
      },
    ])), { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getDiningMenus({
      token: 'session-token',
      date: '2026-10-24',
      meal: 'current',
      locations: ['warren'],
    })

    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/dining/locations/warren/menu?day=2026-10-24')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/v1/dining/locations/warren/menu?day=2026-10-24`)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token')
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-api-key')
    expect(result.recommendations[0]).toMatchObject({
      item_id: 'item-1',
      name: 'Veggie Bowl',
      meal: 'Lunch',
      station: 'Grill',
      nutrition: {
        calories: 450,
        carbs_grams: 40,
        protein_grams: 18,
        saturated_fat_grams: 2,
      },
      tags: { vegan: true, vegetarian: true, gluten_free: true, halal: false },
    })
    expect(result.warnings).toEqual([])
    expect(result.locations[0]).toMatchObject({
      id: 'warren',
      openNow: true,
      currentMeal: 'Lunch',
      selectedMealIsServing: true,
      itemCount: 1,
    })
  })

  it('shows a selected meal today even when it is not currently being served', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(menu('warren', [
      {
        name: 'Lunch',
        stations: [{ name: 'Grill', items: [{ id: 'item-1', name: 'Veggie Bowl' }] }],
      },
    ], { current_meal: 'Breakfast' })), { status: 200 }))))

    const result = await getDiningMenus({
      date: diningDate(),
      meal: 'Lunch',
      locations: ['warren'],
    })

    expect(result.recommendations.map(item => item.name)).toEqual(['Veggie Bowl'])
    expect(result.locations[0]).toMatchObject({
      currentMeal: 'Breakfast',
      selectedMeal: 'lunch',
      selectedMealIsServing: true,
      itemCount: 1,
    })
  })

  it('shows a selected meal today when the dining hall is currently closed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(menu('warren', [
      {
        name: 'Dinner',
        stations: [{ name: 'Grill', items: [{ id: 'item-1', name: 'Veggie Bowl' }] }],
      },
    ], {
      open_now: false,
      status: 'closed',
      current_meal: null,
    })), { status: 200 }))))

    const result = await getDiningMenus({
      date: diningDate(),
      meal: 'Dinner',
      locations: ['warren'],
    })

    expect(result.recommendations.map(item => item.name)).toEqual(['Veggie Bowl'])
    expect(result.locations[0]).toMatchObject({
      openNow: false,
      selectedMeal: 'dinner',
      itemCount: 1,
    })
  })

  it('returns closed hall status even when no meal is currently active', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(menu('warren', [], {
      open_now: false,
      status: 'closed',
      current_meal: null,
    })), { status: 200 }))))

    const result = await getDiningMenus({
      date: diningDate(),
      meal: 'current',
      locations: ['warren'],
    })

    expect(result.recommendations).toEqual([])
    expect(result.locations[0]).toMatchObject({ openNow: false, status: 'closed', currentMeal: null })
  })

  it('does not trust a current meal if the dining hall reports closed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(menu('warren', [
      {
        name: 'Lunch',
        stations: [{ name: 'Grill', items: [{ id: 'item-1', name: 'Veggie Bowl' }] }],
      },
    ], { open_now: false, status: 'closed' })), { status: 200 }))))

    const result = await getDiningMenus({
      date: diningDate(),
      meal: 'current',
      locations: ['warren'],
    })

    expect(result.recommendations).toEqual([])
    expect(result.locations[0]).toMatchObject({
      openNow: false,
      servingNow: false,
      selectedMealIsServing: false,
      itemCount: 0,
    })
    expect(result.currentMeals).toEqual([])
  })

  it('keeps available menus when one location request fails', async () => {
    const fetchMock = vi.fn(url => String(url).includes('/west/')
      ? Promise.resolve(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 }))
      : Promise.resolve(new Response(JSON.stringify(menu('warren', [])), { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getDiningMenus({
      date: '2026-10-24',
      meal: 'Lunch',
      locations: ['warren', 'west'],
    })

    expect(result.recommendations).toEqual([])
    expect(result.warnings).toEqual(['Unavailable'])
  })

  it('preserves session expiry so the UI can request sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ message: 'Missing API key in request' }), { status: 401 })
    )))

    await expect(getDiningMenus({
      date: '2026-10-24',
      meal: 'Lunch',
      locations: ['warren'],
    })).rejects.toMatchObject({ status: 401 })
  })

  it('shows an upstream failure once when all locations fail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ error: 'Dining service unavailable.' }), { status: 502 })
    )))
    await expect(getDiningMenus({ date: '2026-10-24', meal: 'Lunch', locations: ['warren', 'west', 'marciano'] }))
      .rejects.toThrow(/^Dining service unavailable\.$/)
  })
})
