<script setup>
import { computed, ref, watch } from 'vue'
import { ApiError } from '../api.js'
import { LOCATIONS, MAX_DAYS_AHEAD, MEALS, diningDate, getRecommendations } from '../dining.js'
import RecommendationCard from './RecommendationCard.vue'

const props = defineProps({ token: { type: String, required: true } })
const emit = defineEmits(['expired'])

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const dates = Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, offset) => {
  const value = diningDate(offset)
  const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekday.format(new Date(`${value}T12:00:00Z`))
  return { value, label }
})

const date = ref(dates[0].value)
const meal = ref('current')
const locations = ref(LOCATIONS.map(location => location.id))
const loading = ref(false)
const error = ref('')
const result = ref(null)

const isToday = computed(() => date.value === dates[0].value)
const mealOptions = computed(() => MEALS.filter(name => name !== 'current' || isToday.value))

// "Now" only makes sense for today.
watch(isToday, today => { if (!today && meal.value === 'current') meal.value = 'Lunch' })

async function submit() {
  if (loading.value) return
  error.value = ''
  if (!locations.value.length) {
    error.value = 'Please choose at least one dining hall.'
    return
  }
  loading.value = true
  try {
    result.value = await getRecommendations(props.token, { date: date.value, meal: meal.value, locations: locations.value })
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) emit('expired')
    else error.value = cause.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="recommend-title" :aria-busy="loading">
    <h2 id="recommend-title">Get dish recommendations</h2>
    <p class="intro">Compare today’s menus and find dishes that match your preferences.</p>
    <form novalidate @submit.prevent="submit">
      <div class="field-row">
        <div class="field">
          <label for="rec-date">Day</label>
          <select id="rec-date" v-model="date" :disabled="loading">
            <option v-for="option in dates" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
        <div class="field">
          <label for="rec-meal">Meal</label>
          <select id="rec-meal" v-model="meal" :disabled="loading">
            <option v-for="name in mealOptions" :key="name" :value="name">{{ name === 'current' ? 'Now' : name }}</option>
          </select>
        </div>
      </div>
      <fieldset class="choices">
        <legend>Dining halls</legend>
        <label v-for="location in LOCATIONS" :key="location.id" class="check">
          <input v-model="locations" type="checkbox" name="locations" :value="location.id" :disabled="loading" />
          <span>{{ location.name }}</span>
        </label>
      </fieldset>
      <p v-if="error" class="feedback" role="alert">{{ error }}</p>
      <button class="primary" type="submit" :disabled="loading">{{ loading ? 'Finding dishes…' : 'Get recommendations' }}</button>
    </form>

    <div class="results" aria-live="polite">
      <p v-if="loading" class="intro" role="status">Checking menus and asking our AI assistant. This can take a few seconds…</p>
      <template v-else-if="result">
        <div v-if="result.best_location" class="best-pick">
          <span class="account-label">Best pick for you</span>
          <h3>{{ result.best_location.name }}</h3>
          <p>{{ result.summary }}</p>
        </div>
        <p v-else class="intro">{{ result.summary }}</p>
        <p v-if="result.fallback && result.recommendations.length" class="hint">
          Our AI assistant was unavailable, so these dishes are ranked by your saved preferences.
        </p>
        <ul v-if="result.warnings.length" class="warnings" aria-label="Notices">
          <li v-for="warning in result.warnings" :key="warning">{{ warning }}</li>
        </ul>
        <ol v-if="result.recommendations.length" class="rec-list">
          <RecommendationCard v-for="(item, index) in result.recommendations" :key="`${item.location.id}:${item.item_id}`" :item="item" :rank="index + 1" />
        </ol>
        <p class="footnote">Menus come from BU Dining Services and can change. AI suggestions may be imperfect.</p>
      </template>
    </div>
  </section>
</template>
