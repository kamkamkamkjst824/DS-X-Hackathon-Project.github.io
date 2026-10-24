import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { diningDate } from '../dining.js'
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
  it('requests recommendations for the selected halls and renders results', async () => {
    const fetchMock = mockFetch(() => jsonResponse(RESULT))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('input[value="west"]').setValue(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/recommend$/)
    expect(JSON.parse(init.body)).toEqual({ date: diningDate(0), meal: 'current', locations: ['marciano', 'warren'] })
    expect(wrapper.find('.best-pick h3').text()).toBe('Warren Towers')
    expect(wrapper.find('.warnings').text()).toContain('Marciano Commons menu is unavailable')
    const card = wrapper.find('.rec-card')
    expect(card.find('h4').text()).toBe('Chicken Tikka Masala')
    expect(card.text()).toContain('Warren Towers · Lunch · International')
    expect(card.text()).toContain('Spiced chicken you will love.')
    expect(card.text()).toContain('520 kcal')
    expect(card.text()).not.toContain('Carbs')
    expect(card.findAll('.rec-tags li').map(tag => tag.text())).toEqual(['Gluten-free', 'Halal'])
    expect(card.find('details').text()).toContain('Chicken, tomato, cream')
    expect(card.find('a').attributes('rel')).toBe('noopener noreferrer')
  })

  it('hides "Now" for future days and requires at least one hall', async () => {
    const fetchMock = mockFetch(() => jsonResponse(RESULT))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    expect(wrapper.find('#rec-meal option').text()).toBe('Now')
    await wrapper.find('#rec-date').setValue(diningDate(1))
    expect(wrapper.findAll('#rec-meal option').map(option => option.text())).not.toContain('Now')
    expect(wrapper.find('#rec-meal').element.value).toBe('Lunch')
    for (const id of ['marciano', 'warren', 'west']) await wrapper.find(`input[value="${id}"]`).setValue(false)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toBe('Please choose at least one dining hall.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the empty state, fallback notice and errors', async () => {
    let reply = { ...RESULT, best_location: null, summary: 'No menu items match your dietary settings for this meal.', recommendations: [], warnings: [] }
    mockFetch(() => (reply instanceof Error ? Promise.reject(reply) : jsonResponse(reply, reply.status || 200)))
    const wrapper = mount(RecommendPanel, { props: { token: TOKEN } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No menu items match')
    expect(wrapper.find('.rec-list').exists()).toBe(false)

    reply = { ...RESULT, fallback: true }
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('ranked by your saved preferences')

    reply = { error: 'Unable to load dining menus right now. Please try again later.', status: 502 }
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Unable to load dining menus right now. Please try again later.')

    reply = { error: 'expired', status: 401 }
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('expired')).toHaveLength(1)
  })
})
