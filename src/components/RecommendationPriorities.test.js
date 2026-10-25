import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecommendationPriorities from './RecommendationPriorities.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../api.js', () => ({ request, ApiError: class ApiError extends Error {} }))

afterEach(() => localStorage.clear())
beforeEach(() => request.mockReset().mockImplementation(async (path, options = {}) => (
  options.method === 'PUT' ? options.body : {
    mode: 'default',
    priority_order: { nutrition: 1, food: 2, location: 3 },
    custom_weights: { nutrition: 45, food: 35, location: 20 },
    updatedAt: null,
  }
)))

describe('RecommendationPriorities', () => {
  it('loads and saves the selected preference priorities', async () => {
    localStorage.setItem('recommendationPriorities', JSON.stringify({
      version: 1,
      order: { food: 1, location: 2, nutrition: 3 },
    }))
    const wrapper = mount(RecommendationPriorities, { props: { token: 'test-token' } })
    await flushPromises()

    expect(wrapper.find('#priority-food').element.value).toBe('1')
    expect(wrapper.find('#priority-location').element.value).toBe('2')
    expect(wrapper.find('#priority-nutrition').element.value).toBe('3')

    await wrapper.find('form').trigger('submit')

    expect(JSON.parse(localStorage.getItem('recommendationPriorities'))).toEqual({
      version: 1,
      order: { food: 1, location: 2, nutrition: 3 },
    })
    expect(wrapper.find('[role="status"]').text()).toBe('Recommendation settings saved.')
    expect(request).toHaveBeenCalledWith('/api/recommendation-settings', expect.objectContaining({ method: 'PUT' }))
  })

  it('falls back to server defaults for invalid legacy data and allows saving', async () => {
    localStorage.setItem('recommendationPriorities', JSON.stringify({
      version: 1, order: { food: 1, location: 1, nutrition: 3 },
    }))
    const wrapper = mount(RecommendationPriorities, { props: { token: 'test-token' } })
    await flushPromises()
    expect(wrapper.find('#priority-nutrition').element.value).toBe('1')

    await wrapper.find('#priority-food').setValue('2')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toBe('Recommendation settings saved.')
  })

  it('swaps the previous owner of a selected priority automatically', async () => {
    const wrapper = mount(RecommendationPriorities, { props: { token: 'test-token' } })
    await flushPromises()

    await wrapper.find('#priority-nutrition').setValue('2')
    expect(wrapper.find('#priority-nutrition').element.value).toBe('2')
    expect(wrapper.find('#priority-food').element.value).toBe('1')
    expect(wrapper.find('#priority-location').element.value).toBe('3')

    await wrapper.find('form').trigger('submit')

    expect(JSON.parse(localStorage.getItem('recommendationPriorities')).order).toEqual({
      food: 1,
      location: 3,
      nutrition: 2,
    })
  })

  it('supports swapping two priorities successively', async () => {
    const wrapper = mount(RecommendationPriorities, { props: { token: 'test-token' } })
    await flushPromises()

    await wrapper.find('#priority-nutrition').setValue('2')
    await wrapper.find('#priority-location').setValue('1')
    await wrapper.find('form').trigger('submit')

    expect(JSON.parse(localStorage.getItem('recommendationPriorities')).order).toEqual({
      food: 3,
      location: 1,
      nutrition: 2,
    })
  })
})
