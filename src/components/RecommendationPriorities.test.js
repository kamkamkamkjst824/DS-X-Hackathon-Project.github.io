import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RecommendationPriorities from './RecommendationPriorities.vue'

afterEach(() => localStorage.clear())

describe('RecommendationPriorities', () => {
  it('loads and saves the selected preference priorities', async () => {
    localStorage.setItem('recommendationPriorities', JSON.stringify({
      version: 1,
      order: { food: 1, location: 2, nutrition: 3 },
    }))
    const wrapper = mount(RecommendationPriorities)
    await flushPromises()

    expect(wrapper.find('#priority-food').element.value).toBe('1')
    expect(wrapper.find('#priority-location').element.value).toBe('2')
    expect(wrapper.find('#priority-nutrition').element.value).toBe('3')

    await wrapper.find('form').trigger('submit')

    expect(JSON.parse(localStorage.getItem('recommendationPriorities'))).toEqual({
      version: 1,
      order: { food: 1, location: 2, nutrition: 3 },
    })
    expect(wrapper.find('[role="status"]').text()).toBe('Recommendation priorities saved.')
  })

  it('reports invalid saved priority data and allows saving a valid order', async () => {
    localStorage.setItem('recommendationPriorities', JSON.stringify({
      version: 1,
      order: { food: 1, location: 1, nutrition: 3 },
    }))
    const wrapper = mount(RecommendationPriorities)
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Saved recommendation priorities are invalid')

    await wrapper.find('#priority-food').setValue('2')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toBe('Recommendation priorities saved.')
  })

  it('swaps the previous owner of a selected priority automatically', async () => {
    const wrapper = mount(RecommendationPriorities)
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
    const wrapper = mount(RecommendationPriorities)
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
