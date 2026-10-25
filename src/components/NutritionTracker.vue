<script setup>
import { computed, onMounted, ref } from 'vue'
import { diningDate } from '../dining.js'

const props = defineProps({
  userEmail: { type: String, required: true },
})

const nutrients = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g' },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g' },
]
const meals = ['Breakfast', 'Brunch', 'Lunch', 'Dinner']
const storageKey = `nutrition-log:${encodeURIComponent(props.userEmail.trim().toLowerCase())}`
const goalsStorageKey = `nutrition-goals:${encodeURIComponent(props.userEmail.trim().toLowerCase())}`
const entriesByDate = ref({})
const goals = ref(Object.fromEntries(nutrients.map(({ key }) => [key, null])))
const goalDraft = ref(Object.fromEntries(nutrients.map(({ key }) => [key, ''])))
const error = ref('')
const message = ref('')
const selectedDate = ref(diningDate())

function shiftDate(dateString, offset) {
  const date = new Date(`${dateString}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

const dateChoices = computed(() => Array.from({ length: 7 }, (_, index) => {
  const value = shiftDate(selectedDate.value, index - 3)
  const date = new Date(`${value}T12:00:00Z`)
  return {
    value,
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
    day: date.getUTCDate(),
    today: value === diningDate(),
  }
}))
const foods = computed(() => entriesByDate.value[selectedDate.value] || [])
const totals = computed(() => Object.fromEntries(nutrients.map(({ key }) => [
  key,
  foods.value.reduce((sum, food) => sum + (typeof food[key] === 'number' ? food[key] : 0), 0),
])))
const foodGroups = computed(() => meals.map(meal => ({
  meal,
  foods: foods.value.filter(food => (
    food.meal?.toLocaleLowerCase() === meal.toLocaleLowerCase()
    || (meal === 'Dinner' && food.meal === 'Other')
  )),
})))

function format(value) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function loadFoods() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return
    const parsed = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Saved nutrition log has an unexpected format.')
    }
    for (const [date, foodsForDate] of Object.entries(parsed)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(foodsForDate)) {
        throw new Error('Saved nutrition log has an unexpected format.')
      }
      for (const food of foodsForDate) {
        if (
          !food || typeof food.id !== 'string' || typeof food.name !== 'string'
          || (!meals.includes(food.meal) && food.meal !== 'Other')
          || nutrients.some(({ key }) => food[key] !== null && (!Number.isFinite(food[key]) || food[key] < 0))
        ) {
          throw new Error('Saved nutrition log has an unexpected format.')
        }
      }
    }
    entriesByDate.value = parsed
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load saved nutrition log.'
  }
}

function persist(nextEntries) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(nextEntries))
    entriesByDate.value = nextEntries
    return true
  } catch {
    error.value = 'Unable to save your nutrition log. Check that browser storage is available.'
    return false
  }
}

function loadGoals() {
  try {
    const saved = localStorage.getItem(goalsStorageKey)
    if (!saved) return
    const parsed = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Saved nutrition goals have an unexpected format.')
    }
    for (const { key } of nutrients) {
      const value = parsed[key]
      if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new Error('Saved nutrition goals have an unexpected format.')
      }
      goals.value[key] = value ?? null
      goalDraft.value[key] = value === null || value === undefined ? '' : String(value)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load saved nutrition goals.'
  }
}

function saveGoals() {
  error.value = ''
  const nextGoals = {}
  for (const { key, label } of nutrients) {
    const value = goalDraft.value[key].trim()
    if (!value) {
      nextGoals[key] = null
      continue
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      error.value = `Enter a valid non-negative goal for ${label}, or leave it blank.`
      return
    }
    nextGoals[key] = parsed
  }

  try {
    localStorage.setItem(goalsStorageKey, JSON.stringify(nextGoals))
    goals.value = nextGoals
    message.value = 'Nutrition goals saved.'
  } catch {
    error.value = 'Unable to save your nutrition goals. Check that browser storage is available.'
  }
}

function addFood(dish, date = selectedDate.value) {
  error.value = ''
  message.value = ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dish || typeof dish.name !== 'string') {
    error.value = 'Unable to add this dish to the nutrition log.'
    return false
  }
  const nutrition = dish.nutrition || {}
  const food = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: dish.name,
    meal: meals.find(meal => meal.toLocaleLowerCase() === dish.meal?.toLocaleLowerCase()) || 'Dinner',
    calories: validNutrient(nutrition.calories),
    protein: validNutrient(nutrition.protein_grams),
    saturatedFat: validNutrient(nutrition.saturated_fat_grams),
    carbs: validNutrient(nutrition.carbs_grams),
  }
  const nextEntries = {
    ...entriesByDate.value,
    [date]: [...(entriesByDate.value[date] || []), food],
  }
  if (!persist(nextEntries)) return false
  return true
}

function validNutrient(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function removeFood(id) {
  error.value = ''
  message.value = ''
  const remaining = foods.value.filter(food => food.id !== id)
  const nextEntries = { ...entriesByDate.value }
  if (remaining.length) nextEntries[selectedDate.value] = remaining
  else delete nextEntries[selectedDate.value]
  if (persist(nextEntries)) message.value = 'Food removed from your daily log.'
}

function moveDay(offset) {
  selectedDate.value = shiftDate(selectedDate.value, offset)
  message.value = ''
}

defineExpose({ addFood })
onMounted(() => {
  loadFoods()
  loadGoals()
})
</script>

<template>
  <section class="nutrition-tracker" aria-labelledby="nutrition-tracker-title">
    <form class="nutrition-goal-settings" @submit.prevent="saveGoals">
      <div class="nutrition-goal-heading">
        <div>
          <h3>Daily nutrition goals</h3>
          <p>Set any goals you want to track. Leave a field blank to skip it.</p>
        </div>
        <button class="nutrition-goal-save" type="submit">Save goals</button>
      </div>
      <div class="nutrition-goal-fields">
        <label v-for="nutrient in nutrients" :key="nutrient.key" class="nutrition-goal-field">
          <span>{{ nutrient.label }} goal ({{ nutrient.unit }})</span>
          <input
            :value="goalDraft[nutrient.key]"
            type="number"
            min="0"
            step="any"
            :aria-label="`${nutrient.label} goal in ${nutrient.unit}`"
            placeholder="No goal"
            @input="goalDraft[nutrient.key] = $event.target.value"
          >
        </label>
      </div>
    </form>

    <header class="nutrition-tracker-header">
      <button class="nutrition-day-nav" type="button" aria-label="Previous day" @click="moveDay(-1)">‹</button>
      <h2 id="nutrition-tracker-title">
        {{ selectedDate === diningDate() ? 'Today' : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${selectedDate}T12:00:00Z`)) }}
      </h2>
      <button class="nutrition-day-nav" type="button" aria-label="Next day" @click="moveDay(1)">›</button>
    </header>

    <nav class="nutrition-calendar" aria-label="Choose a day">
      <button
        v-for="day in dateChoices"
        :key="day.value"
        type="button"
        class="nutrition-calendar-day"
        :class="{ selected: selectedDate === day.value, today: day.today }"
        :aria-pressed="selectedDate === day.value"
        @click="selectedDate = day.value; message = ''"
      >
        <span>{{ day.weekday }}</span>
        <strong>{{ day.day }}</strong>
      </button>
    </nav>

    <dl class="nutrition-totals" aria-label="Daily nutrition totals">
      <div class="nutrition-total-row nutrition-total-headings" aria-hidden="true">
        <dt>Nutrient</dt>
        <dd><span>Consumed</span><span>Goal</span><span>Remaining</span></dd>
      </div>
      <div v-for="nutrient in nutrients" :key="nutrient.key" class="nutrition-total-row">
        <dt>{{ nutrient.label }}</dt>
        <dd>
          <span>{{ format(totals[nutrient.key]) }} {{ nutrient.unit }}</span>
          <span>{{ goals[nutrient.key] === null ? '—' : `${format(goals[nutrient.key])} ${nutrient.unit}` }}</span>
          <span v-if="goals[nutrient.key] === null">—</span>
          <span v-else-if="totals[nutrient.key] < goals[nutrient.key]">
            {{ format(goals[nutrient.key] - totals[nutrient.key]) }} {{ nutrient.unit }} left
          </span>
          <span v-else-if="totals[nutrient.key] === goals[nutrient.key]">Goal reached</span>
          <span v-else>{{ format(totals[nutrient.key] - goals[nutrient.key]) }} {{ nutrient.unit }} over</span>
        </dd>
      </div>
    </dl>

    <p v-if="error" class="feedback" role="alert">{{ error }}</p>
    <p v-if="message" class="success" role="status">{{ message }}</p>
    <div class="nutrition-meal-sections">
      <section v-for="group in foodGroups" :key="group.meal" class="nutrition-meal">
        <h3>{{ group.meal }}</h3>
        <p v-if="!group.foods.length" class="nutrition-empty">No consumed dishes added.</p>
        <article v-for="food in group.foods" :key="food.id" class="nutrition-log-entry">
          <div>
            <h4>{{ food.name }}</h4>
            <p>
              {{ food.calories === null ? '—' : `${format(food.calories)} kcal` }}
              · {{ food.protein === null ? '—' : `${format(food.protein)} g protein` }}
              · {{ food.saturatedFat === null ? '—' : `${format(food.saturatedFat)} g sat. fat` }}
              · {{ food.carbs === null ? '—' : `${format(food.carbs)} g carbs` }}
            </p>
          </div>
          <button type="button" class="nutrition-remove" :aria-label="`Remove ${food.name}`" @click="removeFood(food.id)">
            Remove
          </button>
        </article>
      </section>
    </div>
    <p class="nutrition-storage-note">Your consumed foods are saved in this browser.</p>
  </section>
</template>
