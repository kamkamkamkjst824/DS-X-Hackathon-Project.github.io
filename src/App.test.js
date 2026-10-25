import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import RecommendPanel from './components/RecommendPanel.vue'
import { DEFAULT_PREFERENCES } from './dining.js'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  localStorage.clear()
  vi.unstubAllGlobals()
})

async function openPlanner({ goals = {}, goalScope = 'per-serving', failSave = '', failLoad = '' } = {}) {
  localStorage.setItem('bu-auth-session', JSON.stringify({ token: 'a'.repeat(64), expiresAt: Date.now() + 60000 }))
  const settings = { mode: 'default', priority_order: { nutrition: 1, food: 2, location: 3 }, custom_weights: { nutrition: 45, food: 35, location: 20 }, updatedAt: 1 }
  const fetchMock = vi.fn(async (url, init = {}) => {
    const path = new URL(url).pathname
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status })
    if (path.endsWith(failLoad) && failLoad && init.method === 'GET') return reply({ error: 'Cannot load saved preferences.' }, 503)
    if (init.method === 'PUT') {
      if (path.endsWith(failSave) && failSave) return reply({ error: 'Could not save targets.' }, 503)
      const body = JSON.parse(init.body)
      return reply(path === '/api/preferences' ? { preferences: body } : body)
    }
    if (path === '/api/auth/me') return reply({ user: { id: 'test', email: 'planner@bu.edu' } })
    if (path === '/api/preferences') return reply({ preferences: { ...DEFAULT_PREFERENCES } })
    if (path === '/api/location-preferences') return reply({ preferences: [{ location: 'warren', rank: 1 }] })
    if (path === '/api/nutrition-preferences') return reply({ goals, goalScope })
    if (path === '/api/recommendation-settings') return reply(settings)
    if (path.includes('/api/v1/dining/locations/')) {
      return reply({
        location: { id: 'warren', name: 'Warren Towers', source_url: 'https://www.bu.edu/dining/' },
        meals: [{ name: 'Lunch', stations: [] }],
        open_now: true,
        status: 'open',
        current_meal: 'Lunch',
        source_url: 'https://www.bu.edu/dining/',
        stale: false,
      })
    }
    if (path === '/api/recommend') return reply({ recommendations: [], summary: 'Test recommendation.', score_weights: { nutrition: 100 }, warnings: [] })
    throw new Error(`Unexpected path: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  wrapper = mount(App)
  await flushPromises()
  return fetchMock
}

const run = async () => {
  await wrapper.find('[aria-labelledby="recommend-title"] form').trigger('submit')
  await flushPromises()
}
const writes = fetchMock => fetchMock.mock.calls.filter(([, init]) => init.method === 'PUT')
const recommendations = fetchMock => fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/recommend'))

describe('Unified dining planner', () => {
  it('saves current edits from every panel before requesting a recommendation', async () => {
    const fetchMock = await openPlanner()
    expect(wrapper.findComponent(RecommendPanel).props('email')).toBe('planner@bu.edu')
    expect(wrapper.findAll('button[type="submit"]')).toHaveLength(2)
    expect(wrapper.find('#nutrition-scope').exists()).toBe(false)
    await wrapper.find('#likes').setValue('chicken')
    await wrapper.find('#preference-west').setValue('2')
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-0-type').setValue('protein')
    await wrapper.find('#nutrition-0-value').setValue(25)
    await wrapper.find('.advanced-toggle input').setValue(true)
    await wrapper.find('#weight-nutrition').setValue(60)
    await run()

    const saved = Object.fromEntries(writes(fetchMock).map(([url, init]) => [new URL(url).pathname, JSON.parse(init.body)]))
    expect(saved['/api/preferences'].likes).toBe('chicken')
    expect(saved['/api/location-preferences'].preferences).toContainEqual({ location: 'west', rank: 2 })
    expect(saved['/api/nutrition-preferences']).toEqual({ goals: { protein: 25 }, goal_scope: 'per-serving' })
    expect(saved['/api/recommendation-settings'].custom_weights.nutrition).toBe(60)
    const recIndex = fetchMock.mock.calls.findIndex(([url]) => url.endsWith('/api/recommend'))
    expect(writes(fetchMock)).toHaveLength(4)
    expect(fetchMock.mock.calls.slice(recIndex + 1).some(([, init]) => init.method === 'PUT')).toBe(false)
    expect(recommendations(fetchMock)).toHaveLength(1)
    expect(wrapper.text()).toContain('Test recommendation.')
  })

  it('validates every panel before writing any settings', async () => {
    const fetchMock = await openPlanner()
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-0-type').setValue('protein')
    await run()
    expect(wrapper.text()).toContain('Please enter a value for Protein')
    expect(writes(fetchMock)).toHaveLength(0)
    expect(recommendations(fetchMock)).toHaveLength(0)
  })

  it('requires review of legacy daily goals before converting them', async () => {
    const fetchMock = await openPlanner({ goals: { calories: 2000 }, goalScope: 'daily' })
    await run()
    expect(writes(fetchMock)).toHaveLength(0)
    expect(wrapper.find('.legacy-targets').text()).toContain('whole day')
    await wrapper.find('#nutrition-0-value').setValue(500)
    await wrapper.find('.legacy-targets input').setValue(true)
    await run()
    const [, init] = writes(fetchMock).find(([url]) => url.endsWith('/api/nutrition-preferences'))
    expect(JSON.parse(init.body)).toEqual({ goals: { calories: 500 }, goal_scope: 'per-serving' })
    expect(recommendations(fetchMock)).toHaveLength(1)
    expect(wrapper.find('.legacy-targets').exists()).toBe(false)
  })

  it('does not recommend if saving fails and unlocks the form for retry', async () => {
    const fetchMock = await openPlanner({ failSave: '/api/nutrition-preferences' })
    await run()
    expect(recommendations(fetchMock)).toHaveLength(0)
    expect(wrapper.text()).toContain('Some preferences could not be saved')
    expect(wrapper.find('.planner-fields').element.disabled).toBe(false)
  })

  it('does not overwrite saved preferences when initial loading fails', async () => {
    const fetchMock = await openPlanner({ failLoad: '/api/nutrition-preferences' })
    await run()
    expect(writes(fetchMock)).toHaveLength(0)
    expect(recommendations(fetchMock)).toHaveLength(0)
    expect(wrapper.text()).toContain('Reload your nutrition targets')
  })

  it('clears legacy targets as a draft without writing until save and recommend', async () => {
    const fetchMock = await openPlanner({ goals: { calories: 2000 }, goalScope: 'daily' })
    await wrapper.find('.reset-button').trigger('click')
    expect(writes(fetchMock)).toHaveLength(0)
    await run()
    const [, init] = writes(fetchMock).find(([url]) => url.endsWith('/api/nutrition-preferences'))
    expect(JSON.parse(init.body)).toEqual({ goals: {}, goal_scope: 'per-serving' })
    expect(recommendations(fetchMock)).toHaveLength(1)
  })
})
