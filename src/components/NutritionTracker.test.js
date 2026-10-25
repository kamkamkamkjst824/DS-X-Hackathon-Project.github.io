import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { diningDate } from '../dining.js'
import NutritionTracker from './NutritionTracker.vue'

afterEach(() => localStorage.clear())

const DISH = {
  item_id: 'dish-1',
  name: 'Greek yogurt bowl',
  meal: 'Breakfast',
  nutrition: {
    calories: 250,
    protein_grams: 18,
    saturated_fat_grams: 2,
    carbs_grams: 30,
  },
}

const totalRows = wrapper => wrapper.findAll('.nutrition-total-row:not(.nutrition-total-headings)')

describe('NutritionTracker', () => {
  it('shows plain daily nutrient totals and logs consumed recommended dishes', async () => {
    const wrapper = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    expect(wrapper.find('#nutrition-tracker-title').text()).toBe('Today')
    expect(wrapper.find('.nutrition-calendar').exists()).toBe(true)
    expect(totalRows(wrapper)).toHaveLength(4)

    expect(wrapper.vm.addFood(DISH)).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('Greek yogurt bowl')
    expect(totalRows(wrapper)[0].text()).toContain('250 kcal')
    expect(totalRows(wrapper)[1].text()).toContain('18 g')
    expect(totalRows(wrapper)[2].text()).toContain('2 g')
    expect(totalRows(wrapper)[3].text()).toContain('30 g')
    expect(wrapper.find('.nutrition-rings').exists()).toBe(false)
    expect(wrapper.find('.nutrition-meal h3').text()).toBe('Breakfast')
    const todayValue = diningDate()
    expect(JSON.parse(localStorage.getItem('nutrition-log:student%40bu.edu'))[todayValue][0]).toMatchObject({
      name: 'Greek yogurt bowl',
      meal: 'Breakfast',
      calories: 250,
    })

    const reloaded = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    expect(reloaded.text()).toContain('Greek yogurt bowl')
    expect(totalRows(reloaded)[1].text()).toContain('18 g')
  })

  it('keeps daily entries separate and allows removal', async () => {
    const wrapper = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    const todayValue = diningDate()
    wrapper.vm.addFood(DISH, todayValue)
    await flushPromises()

    await wrapper.find('button[aria-label="Previous day"]').trigger('click')
    expect(wrapper.text()).not.toContain('Greek yogurt bowl')
    await wrapper.find('button[aria-label="Next day"]').trigger('click')
    expect(wrapper.text()).toContain('Greek yogurt bowl')
    await wrapper.find('[aria-label="Remove Greek yogurt bowl"]').trigger('click')
    expect(wrapper.text()).not.toContain('Greek yogurt bowl')
    expect(totalRows(wrapper)[0].text()).toContain('0 kcal')
  })

  it('logs available nutrients when menu nutrition values are missing', async () => {
    const wrapper = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    expect(wrapper.vm.addFood({
      ...DISH,
      nutrition: { calories: 100, protein_grams: null, saturated_fat_grams: undefined, carbs_grams: 12 },
    })).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('100 kcal')
    expect(wrapper.text()).toContain('—')
    expect(totalRows(wrapper)[1].text()).toContain('0 g')
    expect(totalRows(wrapper)[2].text()).toContain('0 g')
    expect(totalRows(wrapper)[3].text()).toContain('12 g')
  })

  it('shows meal groups through dinner without a separate Other section', async () => {
    const wrapper = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    wrapper.vm.addFood({ ...DISH, name: 'Late snack', meal: 'Other' })
    await flushPromises()

    expect(wrapper.findAll('.nutrition-meal h3').map(heading => heading.text())).toEqual([
      'Breakfast',
      'Brunch',
      'Lunch',
      'Dinner',
    ])
    expect(wrapper.findAll('.nutrition-meal')[3].text()).toContain('Late snack')
  })

  it('saves optional daily goals and shows amounts remaining beside consumed totals', async () => {
    const wrapper = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    wrapper.vm.addFood(DISH)
    await flushPromises()
    await wrapper.find('[aria-label="Calories goal in kcal"]').setValue('500')
    await wrapper.find('[aria-label="Protein goal in g"]').setValue('25')
    await wrapper.find('.nutrition-goal-settings').trigger('submit')

    expect(totalRows(wrapper)[0].text()).toContain('250 kcal')
    expect(totalRows(wrapper)[0].text()).toContain('500 kcal')
    expect(totalRows(wrapper)[0].text()).toContain('250 kcal left')
    expect(totalRows(wrapper)[1].text()).toContain('7 g left')
    expect(JSON.parse(localStorage.getItem('nutrition-goals:student%40bu.edu'))).toMatchObject({
      calories: 500,
      protein: 25,
    })

    const reloaded = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    await flushPromises()
    expect(totalRows(reloaded)[0].text()).toContain('250 kcal left')
  })

  it('rejects negative nutrition goals', async () => {
    const wrapper = mount(NutritionTracker, {
      props: { userEmail: 'student@bu.edu' },
    })
    await wrapper.find('[aria-label="Calories goal in kcal"]').setValue('-1')
    await wrapper.find('.nutrition-goal-settings').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toContain('valid non-negative goal')
    expect(localStorage.getItem('nutrition-goals:student%40bu.edu')).toBeNull()
  })
})
