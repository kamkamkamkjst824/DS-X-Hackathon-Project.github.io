<script setup>
import { computed, ref, watch } from 'vue'
import { ApiError, request } from '../api.js'
import { LOCATIONS, MAX_DAYS_AHEAD, MEALS, diningDate } from '../dining.js'
import RecommendationCard from './RecommendationCard.vue'
import { readLocationRanks } from '../recommendationRanking.js'

const props = defineProps({ token: { type: String, required: true }, beforeRecommend: Function })
const emit = defineEmits(['expired', 'busy'])

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const dates = Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, offset) => {
  const value = diningDate(offset)
  const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekday.format(new Date(`${value}T12:00:00Z`))
  return { value, label }
})

const date = ref(dates[0].value)
const meal = ref('current')
const loading = ref(false)
const error = ref('')
const result = ref(null)
const notices = ref([])
const sourceUrls = computed(() => [...new Set((result.value?.recommendations || []).map(item => item.source_url).filter(Boolean))])

const isToday = computed(() => date.value === dates[0].value)
const mealOptions = computed(() => MEALS.filter(name => name !== 'current' || isToday.value))

// "Now" only makes sense for today.
watch(isToday, today => { if (!today && meal.value === 'current') meal.value = 'Lunch' })

async function submit() {
  if (loading.value) return
  error.value = ''
  result.value = null
  notices.value = []
  loading.value = true
  emit('busy', true)
  try {
    await props.beforeRecommend?.()
    const locationRanks = await readLocationRanks(props.token)
    const locations = LOCATIONS
      .filter(location => Object.hasOwn(locationRanks, location.id))
      .map(location => location.id)
    if (!locations.length) {
      throw new Error('Choose at least one location in Location preference before requesting recommendations.')
    }

    const response = await request('/api/recommend', { method: 'POST', token: props.token, timeout: 45000, body: {
      date: date.value,
      meal: meal.value,
      locations,
    } })
    result.value = { ...response, preferenceSummary: Object.entries(response.score_weights || {})
      .map(([key, value]) => `${{ nutrition: 'Nutrition', food: 'Food preferences', location: 'Dining location' }[key]}: ${value}%`) }
    notices.value = response.warnings || []
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) emit('expired')
    else error.value = cause.message
  } finally {
    loading.value = false
    emit('busy', false)
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="recommend-title" :aria-busy="loading">
    <h2 id="recommend-title">Dish recommendation</h2>
    <p class="intro">This website should not be used for nutritional advice and instead as recommendations</p>
    <p class="intro">{{ beforeRecommend ? 'Save all your current preferences and get AI recommendations in one step.' : 'AI recommendations use your saved dietary needs and preference weights.' }}</p>
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
      <p v-if="error" class="feedback" role="alert">{{ error }}</p>
      <button class="primary" type="submit" :disabled="loading">{{ loading ? 'Finding dishes…' : beforeRecommend ? 'Save and recommend' : 'Dish recommendation' }}</button>
    </form>

    <div class="results" aria-live="polite">
      <p v-if="loading" class="intro" role="status">Checking menus, scoring dishes, and asking our AI assistant…</p>
      <template v-else-if="result">
        <div class="preference-summary">
          <h3>Scoring weights</h3>
          <p class="hint">Actual weights used for this recommendation. Inactive preferences are excluded and the remaining weights are rescaled to total 100%.</p>
          <ul>
            <li v-for="line in result.preferenceSummary" :key="line">{{ line }}</li>
          </ul>
          <p v-if="result.score_weights?.nutrition === 0" class="hint">To include nutrition, add a target for one dish above and give nutrition a positive weight, then save and recommend again.</p>
        </div>
        <div v-if="result.best_location" class="best-pick">
          <span class="account-label">Best pick for you</span>
          <h3>{{ result.best_location.name }}</h3>
          <p>{{ result.summary }}</p>
        </div>
        <p v-else class="intro">{{ result.summary }}</p>
        <ul v-if="notices.length" class="warnings" aria-label="Recommendation notices">
          <li v-for="notice in notices" :key="notice">{{ notice }}</li>
        </ul>
        <p v-if="result.fallback && result.recommendations.length" class="hint">
          Our AI assistant was unavailable, so these dishes are ranked by your weighted scores.
        </p>
        <ol v-if="result.recommendations.length" class="rec-list">
          <RecommendationCard v-for="(item, index) in result.recommendations" :key="`${item.location.id}:${item.item_id}`" :item="item" :rank="index + 1" />
        </ol>
        <p class="footnote">
          Menus are provided by BU Dining Services and may change.
          <a v-for="source in sourceUrls" :key="source" :href="source" target="_blank" rel="noopener noreferrer">View menu</a>
        </p>
      </template>
    </div>
  </section>
</template>
