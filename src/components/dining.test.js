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
    if (url.endsWith('/api/location-preferences')) return jsonResponse({ preferences: locationRanks })
    if (url.endsWith('/api/nutrition-preferences')) return jsonResponse({ goals: {}, updatedAt: null })
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
      if (init?.method === 'PUT') return jsonResponse(JSON.parse(init.body))
      return jsonResponse({ preferences: LOCATION_RANKS })
    })
    const wrapper = mount(LocationPreference, { props: { token: TOKEN } })
    await flushPromises()

    await wrapper.find('#preference-west').setValue('excluded')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(url).toMatch(/\/api\/location-preferences$/)
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
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
  score_weights: { nutrition: 0, food: 63.6, location: 36.4 },
  warnings: ['Marciano Commons menu is unavailable right now.'],
  locations: [],
  recommendations: [{
    item_id: 'W1', name: 'Chicken Tikka Masala', description: 'Spiced chicken', location: { id: 'warren', name: 'Warren Towers' },
    meal: 'Lunch', station: 'International', reason: 'Spiced chicken you will love.', score: 81.3,
    score_breakdown: { nutrition: null, food: 100, location: 50 },
    nutrition: { calories: 520, protein_grams: 32, carbs_grams: null, saturated_fat_grams: 4 },
    tags: { vegan: false, vegetarian: false, gluten_free: true, halal: true, cool_food: false },
    ingredients: 'Chicken, tomato, cream', allergy_notice: 'Speak with BU Dining staff about allergies.',
    source_url: 'https://www.bu.edu/dining/location/warren/', details_available: true,
  }],
}

describe('RecommendPanel', () => {
  it('keeps favorites working on AI recommendation cards', async () => {
    mockFetch(url => url.endsWith('/api/location-preferences')
      ? jsonResponse({ preferences: LOCATION_RANKS })
      : jsonResponse(RESULT))
    const email = 'merge-favorites@bu.edu'
    const storageKey = `bu-dish-favorites:${email}`
    localStorage.removeItem(storageKey)
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN, email } })
    try {
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      const button = wrapper.find('.favorite-button')
      await button.trigger('click')
      expect(button.attributes('aria-pressed')).toBe('true')
      expect(JSON.parse(localStorage.getItem(storageKey))).toEqual([
        expect.objectContaining({ id: 'W1', name: 'Chicken Tikka Masala', location: 'warren' }),
      ])
      await button.trigger('click')
      expect(JSON.parse(localStorage.getItem(storageKey))).toEqual([])
      expect(wrapper.text()).toContain('Preference score: 81.3/100')
    } finally {
      wrapper.unmount()
      localStorage.removeItem(storageKey)
    }
  })

  it('requests AI recommendations and renders scores, reasons, and source links', async () => {
    const fetchMock = mockFetch((url, init) => url.endsWith('/api/location-preferences')
      ? jsonResponse({ preferences: LOCATION_RANKS })
      : jsonResponse(RESULT))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).endsWith('/api/recommend'))
    expect(url).toContain('/api/recommend')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ date: diningDate(0), meal: 'current', locations: ['marciano', 'warren', 'west'] })
    expect(wrapper.find('.best-pick h3').text()).toBe('Warren Towers')
    expect(wrapper.find('.warnings').text()).toContain('Marciano Commons menu is unavailable')
    const card = wrapper.find('.rec-card')
    expect(card.find('h4').text()).toBe('Chicken Tikka Masala')
    expect(card.text()).toContain('Warren Towers · Lunch · International')
    expect(card.text()).toContain('Spiced chicken you will love.')
    expect(card.text()).toContain('Preference score: 81.3/100')
    expect(card.text()).toContain('520 kcal')
    expect(card.text()).not.toContain('Carbs')
    expect(card.findAll('.rec-tags li').map(tag => tag.text())).toEqual(['Gluten-free', 'Halal'])
    expect(card.find('details').text()).toContain('Chicken, tomato, cream')
    expect(card.find('a').attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('Scoring weights')
    expect(wrapper.text()).toContain('Food preferences: 63.6%')
  })

  it('preserves the recommendation order returned by the AI', async () => {
    const response = { ...RESULT, recommendations: [...RESULT.recommendations, {
      ...RESULT.recommendations[0], item_id: 'W2', name: 'Second AI choice', score: 40,
    }] }
    mockFetch(url => url.endsWith('/api/location-preferences')
      ? jsonResponse({ preferences: [{ rank: 1, location: 'warren' }] })
      : jsonResponse(response))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.findAll('.rec-card').map(card => card.find('h4').text())).toEqual(['Chicken Tikka Masala', 'Second AI choice'])
  })

  it('hides "Now", removes dining hall controls, and requires a saved location', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ preferences: [] }))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    expect(wrapper.find('#rec-meal option').text()).toBe('Now')
    await wrapper.find('#rec-date').setValue(diningDate(1))
    expect(wrapper.findAll('#rec-meal option').map(option => option.text())).not.toContain('Now')
    expect(wrapper.find('#rec-meal').element.value).toBe('Lunch')
    expect(wrapper.find('fieldset.choices').exists()).toBe(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Choose at least one location in Location preference before requesting recommendations.')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/recommend'))).toBe(false)
  })

  it('sends only locations included in saved preferences', async () => {
    const fetchMock = mockFetch(url => url.endsWith('/api/location-preferences')
      ? jsonResponse({ preferences: [{ rank: 1, location: 'warren' }] })
      : jsonResponse(RESULT))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const recCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/recommend'))
    expect(JSON.parse(recCall[1].body).locations).toEqual(['warren'])
    expect(wrapper.text()).toContain('Scoring weights')
  })

  it('shows an empty state and menu errors', async () => {
    const fetchMock = mockFetch(url => url.endsWith('/api/location-preferences')
      ? jsonResponse({ preferences: LOCATION_RANKS })
      : jsonResponse({ ...RESULT, summary: 'No menu items match your dietary settings for this meal.', best_location: null, recommendations: [] }))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No menu items match')
    expect(wrapper.find('.rec-list').exists()).toBe(false)

    fetchMock.mockImplementationOnce(() => jsonResponse({ preferences: LOCATION_RANKS }))
    fetchMock.mockImplementationOnce(() => jsonResponse({ error: 'Dining API unavailable.' }, 502))
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Dining API unavailable.')
  })
})
