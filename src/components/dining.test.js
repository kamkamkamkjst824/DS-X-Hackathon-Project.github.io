import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { diningDate } from '../dining.js'
import LocationPreference from './LocationPreference.vue'
import PreferencesForm from './PreferencesForm.vue'
import RecommendPanel from './RecommendPanel.vue'

const TOKEN = 'a'.repeat(64)

function jsonResponse(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))
}

function mockFetch(handler) {
  const fetchMock = vi.fn((url, init) => handler(String(url), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

const SAVED = { vegetarian: false, vegan: false, gluten_free: true, halal: false, max_calories: 700, min_protein: null, likes: 'spicy chicken' }
const LOCATION_RANKS = [
  { rank: 1, location: 'warren' },
  { rank: 2, location: 'west' },
  { rank: 3, location: 'marciano' },
]

function menuResponse(location, items = []) {
  const details = {
    marciano: { name: 'Marciano Commons', short_name: 'Marciano' },
    warren: { name: 'Warren Towers', short_name: 'Warren' },
    west: { name: 'West Campus', short_name: 'West' },
  }[location]
  return {
    location: { id: location, ...details, campus: 'Boston', address: 'Boston, MA', source_url: `https://www.bu.edu/dining/location/${location}/` },
    date: diningDate(0),
    meals: [{ name: 'Lunch', stations: [{ name: 'International', items }] }],
    open_now: true,
    status: 'open',
    current_meal: 'Lunch',
    source_url: `https://www.bu.edu/dining/location/${location}/`,
    fetched_at: '2026-10-24T12:00:00Z',
    stale: false,
  }
}

function diningItem(overrides = {}) {
  return {
    id: 'W1',
    name: 'Chicken Tikka Masala',
    description: 'Spiced chicken',
    calories: 520,
    carbohydrates_grams: null,
    protein_grams: 32,
    saturated_fat_grams: 4,
    vegetarian: false,
    vegan: false,
    gluten_free: true,
    halal: true,
    cool_food: false,
    ...overrides,
  }
}

function recommendFetch(handler, locationRanks = LOCATION_RANKS) {
  return mockFetch((url, init) => {
    if (url === '/api/preferences') return jsonResponse({ preferences: locationRanks })
    if (url.endsWith('/api/preferences')) return jsonResponse({ preferences: SAVED, updatedAt: 1 })
    return handler(url, init)
  })
}

describe('PreferencesForm', () => {
  it('loads saved preferences and saves edits', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (init.method === 'PUT') return jsonResponse({ preferences: JSON.parse(init.body), updatedAt: 1 })
      return jsonResponse({ preferences: SAVED, updatedAt: 1 })
    })
    const wrapper = mount(PreferencesForm, { props: { token: TOKEN } })
    await flushPromises()
    expect(wrapper.find('#likes').element.value).toBe('spicy chicken')
    expect(wrapper.find('#max-calories').exists()).toBe(false)
    expect(wrapper.find('#min-protein').exists()).toBe(false)
    expect(wrapper.find('input[name="gluten_free"]').element.checked).toBe(true)

    await wrapper.find('input[name="vegan"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toMatch(/\/api\/preferences$/)
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(init.body)).toEqual({ ...SAVED, vegan: true, vegetarian: true, max_calories: null, min_protein: null })
    expect(wrapper.find('[role="status"]').text()).toBe('Preferences saved.')
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('shows server errors', async () => {
    mockFetch((url, init) => init.method === 'PUT'
      ? jsonResponse({ error: 'Food preferences must be 300 characters or fewer.' }, 400)
      : jsonResponse({ preferences: SAVED, updatedAt: 1 }))
    const wrapper = mount(PreferencesForm, { props: { token: TOKEN } })
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Food preferences must be 300 characters or fewer.')
  })

  it('emits expired on 401', async () => {
    mockFetch(() => jsonResponse({ error: 'Your session has expired. Please sign in again.' }, 401))
    const wrapper = mount(PreferencesForm, { props: { token: TOKEN } })
    await flushPromises()
    expect(wrapper.emitted('expired')).toHaveLength(1)
  })
})

describe('LocationPreference', () => {
  it('saves only ranked locations and omits locations marked "Don\'t want"', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (init?.method === 'POST') return jsonResponse({ preferences: JSON.parse(init.body) })
      return jsonResponse({ preferences: LOCATION_RANKS })
    })
    const wrapper = mount(LocationPreference)
    await flushPromises()

    await wrapper.find('#preference-west').setValue('excluded')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [, init] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(JSON.parse(init.body)).toEqual({
      preferences: [
        { rank: 1, location: 'warren' },
        { rank: 3, location: 'marciano' },
      ],
    })
    expect(wrapper.text()).toContain('Preference saved.')
  })
})

const RESULT = {
  date: '2026-10-24', meal: 'current', fallback: false, model: 'workers-ai',
  best_location: { id: 'warren', name: 'Warren Towers' },
  summary: 'Head to Warren Towers for curry.',
  warnings: ['Marciano Commons menu is unavailable right now.'],
  locations: [],
  recommendations: [{
    item_id: 'W1', name: 'Chicken Tikka Masala', description: 'Spiced chicken', location: { id: 'warren', name: 'Warren Towers' },
    meal: 'Lunch', station: 'International', reason: 'Spiced chicken you will love.',
    nutrition: { calories: 520, protein_grams: 32, carbs_grams: null, saturated_fat_grams: 4 },
    tags: { vegan: false, vegetarian: false, gluten_free: true, halal: true, cool_food: false },
    ingredients: 'Chicken, tomato, cream', allergy_notice: 'Speak with BU Dining staff about allergies.',
    source_url: 'https://www.bu.edu/dining/location/warren/', details_available: true,
  }],
}

describe('RecommendPanel', () => {
  it('requests menus from BU Dining, ranks dishes and renders results', async () => {
    const fetchMock = recommendFetch(url => {
      const location = url.includes('/marciano/') ? 'marciano' : 'warren'
      if (location === 'marciano') return jsonResponse({ detail: 'Marciano Commons menu is unavailable right now.' }, 502)
      return jsonResponse(menuResponse(location, [diningItem()]))
    }, [
      { rank: 1, location: 'warren' },
      { rank: 2, location: 'marciano' },
    ])
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const menuCalls = fetchMock.mock.calls.filter(([requestUrl]) => String(requestUrl).includes('/api/v1/dining/'))
    expect(menuCalls).toHaveLength(2)
    expect(menuCalls[0][0]).toContain(`day=${diningDate(0)}`)
    expect(wrapper.find('.best-pick h3').text()).toBe('Warren Towers')
    expect(wrapper.find('.warnings').text()).toContain('Marciano Commons menu is unavailable')
    const card = wrapper.find('.rec-card')
    expect(card.find('h4').text()).toBe('Chicken Tikka Masala')
    expect(card.text()).toContain('Warren Towers · Lunch · International')
    expect(card.text()).toContain('Matched against the saved dietary, food, nutrition, and location preferences.')
    expect(card.text()).toContain('520 kcal')
    expect(card.text()).not.toContain('Carbs')
    expect(card.findAll('.rec-tags li').map(tag => tag.text())).toEqual(['Gluten-free', 'Halal'])
    expect(card.find('details').text()).toContain('Ingredient details are not available')
    expect(card.find('a').attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('How your preferences were applied')
    expect(wrapper.text()).toContain('Dietary labels (priority 1): Gluten-free.')
    expect(wrapper.text()).toContain('Food keywords (preference priority 2): spicy chicken')
    expect(wrapper.text()).toContain('Nutrition goals (preference priority 1): none selected.')
  })

  it('shows only the top 40 ranked recommendations', async () => {
    const items = Array.from({ length: 41 }, (_, index) => diningItem({
      id: `W${index + 1}`,
      name: `Chicken dish ${index + 1}`,
    }))
    recommendFetch(url => jsonResponse(menuResponse('warren', items)), [
      { rank: 1, location: 'warren' },
    ])
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.findAll('.rec-card')).toHaveLength(40)
    expect(wrapper.find('.rec-card:last-child .rec-rank').text()).toBe('40')
    expect(wrapper.text()).not.toContain('Chicken dish 41')
  })

  it('hides "Now", removes dining hall controls, and requires a saved location', async () => {
    const fetchMock = recommendFetch(() => jsonResponse(RESULT), [])
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    expect(wrapper.find('#rec-meal option').text()).toBe('Now')
    await wrapper.find('#rec-date').setValue(diningDate(1))
    expect(wrapper.findAll('#rec-meal option').map(option => option.text())).not.toContain('Now')
    expect(wrapper.find('#rec-meal').element.value).toBe('Lunch')
    expect(wrapper.find('fieldset.choices').exists()).toBe(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Choose at least one location in Location preference before requesting recommendations.')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/dining/'))).toBe(false)
  })

  it('requests menus only from ranked locations', async () => {
    const fetchMock = recommendFetch(url => {
      return jsonResponse(menuResponse('warren', [diningItem()]))
    }, [{ rank: 1, location: 'warren' }])
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const menuCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter(url => url.includes('/api/v1/dining/'))
    expect(menuCalls).toHaveLength(1)
    expect(menuCalls[0]).toContain('/locations/warren/menu')
    expect(wrapper.text()).toContain('Marciano Commons, West Campus')
  })

  it('shows an empty state and menu errors', async () => {
    let items = []
    let status = 200
    recommendFetch(url => {
      const location = url.includes('/marciano/') ? 'marciano' : url.includes('/warren/') ? 'warren' : 'west'
      return jsonResponse(status === 200 ? menuResponse(location, items) : { detail: 'Dining API unavailable.' }, status)
    })
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No menu items match')
    expect(wrapper.find('.rec-list').exists()).toBe(false)

    items = [diningItem()]
    status = 502
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Dining API unavailable.')
  })
})