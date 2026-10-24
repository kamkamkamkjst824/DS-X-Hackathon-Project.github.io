import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDiningMenus } from './dining.js'

afterEach(() => vi.unstubAllGlobals())

function menu(location, meals) {
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
      date: '2026-10-24',
      meal: 'current',
      locations: ['warren'],
    })

    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/dining/locations/warren/menu?day=2026-10-24')
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
  })

  it('keeps available menus when one location request fails', async () => {
    const fetchMock = vi.fn(url => String(url).includes('/west/')
      ? Promise.resolve(new Response(JSON.stringify({ detail: 'Unavailable' }), { status: 503 }))
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

  it('explains when the BU API key is missing or rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ message: 'Missing API key in request' }), { status: 401 })
    )))

    await expect(getDiningMenus({
      date: '2026-10-24',
      meal: 'Lunch',
      locations: ['warren'],
    })).rejects.toThrow('Set a valid BU_API_KEY in .env.local')
  })
})
