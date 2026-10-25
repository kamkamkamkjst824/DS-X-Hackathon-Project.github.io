// Synthetic BU Dining API payloads shaped like the real /menu and /menu/items responses.

export function item(id, name, overrides = {}) {
  return {
    id, name, description: null,
    calories: 400, carbohydrates_grams: 40, protein_grams: 20, saturated_fat_grams: 3,
    vegetarian: false, vegan: false, gluten_free: false, halal: false, cool_food: false,
    ...overrides,
  }
}

const MENUS = {
  marciano: {
    Lunch: {
      Grill: [
        item('M1', 'Spicy Chicken Sandwich', { calories: 620, protein_grams: 35, halal: true }),
        item('M2', 'Beef Burger', { calories: 700, protein_grams: 30 }),
      ],
      Vegan: [item('M3', 'Tofu Stir Fry', { calories: 380, protein_grams: 18, vegan: true, vegetarian: true, gluten_free: true })],
      'Grill Condiments and More': [item('M4', 'Ketchup', { calories: 15, protein_grams: 0, vegan: true, vegetarian: true })],
    },
    Dinner: { Saute: [item('M5', 'Shrimp Pad Thai', { calories: 550, protein_grams: 24 })] },
  },
  warren: {
    Lunch: {
      International: [
        item('W1', 'Chicken Tikka Masala', { calories: 520, protein_grams: 32, halal: true, gluten_free: true, description: 'Spiced chicken in tomato cream sauce' }),
        item('W2', 'Vegetable Curry', { calories: 300, protein_grams: 8, vegan: true, vegetarian: true, gluten_free: true, halal: true }),
      ],
      'Salad Bar': [item('W3', 'Cucumbers', { calories: 5, protein_grams: 0, vegan: true, vegetarian: true })],
      Soup: [item('W4', 'Chicken Noodle Soup', { calories: 180, protein_grams: 12 })],
    },
  },
  west: {
    Lunch: {
      'Brick Oven': [item('X1', 'Cheese Pizza', { calories: 450, protein_grams: 18, vegetarian: true })],
      Deli: [
        item('X2', 'Turkey Club', { calories: null, protein_grams: 28 }),
        item('X1', 'Cheese Pizza', { calories: 450, protein_grams: 18, vegetarian: true }),
      ],
    },
  },
}

export function menu(location, date, { currentMeal = null, stale = false } = {}) {
  const meals = Object.entries(MENUS[location] || {}).map(([name, stations]) => ({
    name,
    item_count: Object.values(stations).flat().length,
    stations: Object.entries(stations).map(([stationName, items]) => ({ name: stationName, items })),
  }))
  return {
    location: { id: location, name: location, short_name: location, campus: 'Campus', address: 'Address', source_url: `https://www.bu.edu/dining/location/${location}/` },
    date, schedules: [], meals, open_now: Boolean(currentMeal), status: currentMeal ? 'Open until 5pm' : 'Closed',
    current_meal: currentMeal, source_url: `https://www.bu.edu/dining/location/${location}/`, fetched_at: '2026-10-24T12:00:00Z', stale,
  }
}

export function detail(location, itemId, date) {
  for (const [mealName, stations] of Object.entries(MENUS[location] || {})) {
    for (const [stationName, items] of Object.entries(stations)) {
      const found = items.find(entry => entry.id === itemId)
      if (found) {
        return {
          ...found, location: { id: location }, date, meal: mealName, station: stationName,
          ingredients: `Ingredients of ${found.name}`, source_url: `https://www.bu.edu/dining/location/${location}/`,
          fetched_at: '2026-10-24T12:00:00Z', stale: false,
          allergy_notice: 'Menus and ingredients can change. If you have a food allergy, speak with BU Dining staff before ordering.',
        }
      }
    }
  }
  return null
}

/**
 * Fake BU Dining upstream. `fail` lists locations whose menu requests return 503;
 * `failItems` lists item ids whose detail requests fail. Records every request.
 */
export function fakeBu({ fail = [], failItems = [], currentMeal = null, apiKey = 'test-key' } = {}) {
  const calls = []
  const handler = async request => {
    const url = new URL(request.url)
    calls.push({ url: url.toString(), key: request.headers.get('x-api-key') })
    // Mirrors the real gateway, which rejects requests without a User-Agent.
    if (!request.headers.get('user-agent')) return new Response('403 Forbidden', { status: 403 })
    if (request.headers.get('x-api-key') !== apiKey) return Response.json({ message: 'Invalid API key' }, { status: 401 })
    const match = /^\/api\/v1\/dining\/locations\/([a-z]+)\/menu(?:\/items\/([^/]+))?$/.exec(url.pathname)
    if (url.hostname !== 'public.api-nonprod.bu.edu' || !match) return new Response('not found', { status: 404 })
    const [, location, itemId] = match
    const date = url.searchParams.get('day')
    if (fail.includes(location)) return new Response('upstream down', { status: 503 })
    if (itemId) {
      const id = decodeURIComponent(itemId)
      if (failItems.includes(id)) return new Response('error', { status: 500 })
      const found = detail(location, id, date)
      return found ? Response.json(found) : Response.json({ detail: 'Not found' }, { status: 404 })
    }
    return Response.json(menu(location, date, { currentMeal }))
  }
  return { handler, calls }
}
