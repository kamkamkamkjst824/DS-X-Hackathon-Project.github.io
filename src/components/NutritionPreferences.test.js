import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import NutritionPreferences from './NutritionPreferences.vue'

afterEach(() => localStorage.clear())

describe('NutritionPreferences', () => {
  it('starts with no goals and saves only nutrients the user adds', async () => {
    const wrapper = mount(NutritionPreferences)

    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)

    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-0-type').setValue('calories')
    await wrapper.find('#nutrition-0-value').setValue(2000)
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-1-type').setValue('protein')
    await wrapper.find('#nutrition-1-value').setValue(100)
    await wrapper.find('form').trigger('submit')

    expect(JSON.parse(localStorage.getItem('nutritionPreferences'))).toEqual({
      version: 2,
      goals: { calories: 2000, protein: 100 },
    })
    expect(wrapper.find('[role="status"]').text()).toContain('saved successfully')
  })

  it('loads only saved nutrients and can remove them before saving', async () => {
    localStorage.setItem('nutritionPreferences', JSON.stringify({
      version: 2,
      goals: { carbs: 250 },
    }))
    const wrapper = mount(NutritionPreferences)
    await flushPromises()

    expect(wrapper.findAll('input[type="number"]')).toHaveLength(1)
    expect(wrapper.find('#nutrition-0-type').element.value).toBe('carbs')

    await wrapper.find('[aria-label="Remove Carbohydrates goal"]').trigger('click')
    await wrapper.find('form').trigger('submit')

    expect(JSON.parse(localStorage.getItem('nutritionPreferences'))).toEqual({
      version: 2,
      goals: {},
    })
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
  })

  it('ignores an added row until a nutrient type is selected', async () => {
    const wrapper = mount(NutritionPreferences)
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('form').trigger('submit')

    expect(JSON.parse(localStorage.getItem('nutritionPreferences'))).toEqual({
      version: 2,
      goals: {},
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('requires a value for every selected nutrient', async () => {
    const wrapper = mount(NutritionPreferences)
    await wrapper.find('.add-nutrition').trigger('click')
    await wrapper.find('#nutrition-0-type').setValue('calories')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[role="alert"]').text()).toContain('Please enter a value for Calories')
    expect(localStorage.getItem('nutritionPreferences')).toBeNull()
  })

  it('does not show values saved by the old all-fields form', async () => {
    localStorage.setItem('nutritionPreferences', JSON.stringify({
      calories: 2000,
      carbs: 250,
      protein: 100,
      saturated_fat: 20,
    }))
    const wrapper = mount(NutritionPreferences)
    await flushPromises()

    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
  })
})