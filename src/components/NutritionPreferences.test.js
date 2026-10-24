import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NutritionPreferences from './NutritionPreferences.vue'

const TOKEN = 'a'.repeat(64)

function jsonResponse(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))
}

// Simulates the Worker's /api/nutrition-preferences endpoint.
function mockWorker(initialGoals = {}) {
  const state = { goals: initialGoals }
  const fetchMock = vi.fn((url, init = {}) => {
    expect(String(url)).toMatch(/\/api\/nutrition-preferences$/)
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    if (init.method === 'PUT') {
      state.goals = JSON.parse(init.body).goals
      return jsonResponse({ goals: state.goals, updatedAt: 1 })
    }
    return jsonResponse({ goals: state.goals, updatedAt: null })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { state, fetchMock }
}

const puts = fetchMock => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')

afterEach(() => vi.unstubAllGlobals())

describe('NutritionPreferences', () => {
  it('starts with no goals and saves only nutrients the user adds', async () => {
    const { state } = mockWorker()
    const wrapper = mount(NutritionPreferences, { props: { token: TOKEN } })
    await flushPromises()

    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)

    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-0-type').setValue('calories')
    await wrapper.find('#nutrition-0-value').setValue(2000)
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-1-type').setValue('protein')
    await wrapper.find('#nutrition-1-value').setValue(100)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(state.goals).toEqual({ calories: 2000, protein: 100 })
    expect(wrapper.find('[role="status"]').text()).toContain('saved successfully')
  })

  it('loads only saved nutrients and can remove them before saving', async () => {
    const { state } = mockWorker({ carbs: 250 })
    const wrapper = mount(NutritionPreferences, { props: { token: TOKEN } })
    await flushPromises()

    expect(wrapper.findAll('input[type="number"]')).toHaveLength(1)
    expect(wrapper.find('#nutrition-0-type').element.value).toBe('carbs')

    await wrapper.find('[aria-label="Remove Carbohydrates goal"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(state.goals).toEqual({})
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
  })

  it('ignores an added row until a nutrient type is selected', async () => {
    const { state } = mockWorker()
    const wrapper = mount(NutritionPreferences, { props: { token: TOKEN } })
    await flushPromises()
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(state.goals).toEqual({})
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('requires a value for every selected nutrient', async () => {
    const { fetchMock } = mockWorker()
    const wrapper = mount(NutritionPreferences, { props: { token: TOKEN } })
    await flushPromises()
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-0-type').setValue('calories')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please enter a value for Calories')
    expect(puts(fetchMock)).toHaveLength(0)
  })

  it('resets goals on the Worker', async () => {
    const { state } = mockWorker({ protein: 80 })
    const wrapper = mount(NutritionPreferences, { props: { token: TOKEN } })
    await flushPromises()
    await wrapper.find('.reset-button').trigger('click')
    await flushPromises()

    expect(state.goals).toEqual({})
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
    expect(wrapper.find('[role="status"]').text()).toContain('reset')
  })

  it('emits expired on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: 'Your session has expired. Please sign in again.' }, 401)))
    const wrapper = mount(NutritionPreferences, { props: { token: TOKEN } })
    await flushPromises()

    expect(wrapper.emitted('expired')).toHaveLength(1)
  })
})
