
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ApiError, request } from '../api.js'
import { LOCATIONS, MAX_DAYS_AHEAD, MEALS, diningDate, getDiningMenus } from '../dining.js'
import RecommendationCard from './RecommendationCard.vue'
import { readLocationRanks } from '../recommendationRanking.js'
import { FAVORITES_EVENT, dishKey, readFavorites } from '../utils/dishFavorites.js'

const props = defineProps({ token: { type: String, required: true }, email: { type: String, default: '' }, beforeRecommend: Function })
const emit = defineEmits(['expired', 'busy', 'consumed'])

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const today = ref(diningDate())
const dates = computed(() => Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, offset) => {
  const value = diningDate(offset, new Date(`${today.value}T12:00:00Z`))
  const label = offset === 0
    ? 'Today'
    : offset === 1
      ? 'Tomorrow'
      : weekday.format(new Date(`${value}T12:00:00Z`))
  return { value, label }
}))
const date = ref(today.value)
const meal = ref('current')
const loading = ref(false)
const error = ref('')
const availabilityError = ref('')
const availabilityLoading = ref(false)
const result = ref(null)
const notices = ref([])
const favoriteKeys = ref(readFavorites(props.email).map(favorite => favorite.key))
const availableMeals = ref([])
let availabilityRequest = 0
let dateRefreshInterval
const sourceUrls = computed(() => [...new Set((result.value?.recommendations || []).map(item => item.source_url).filter(Boolean))])
const interpretation = computed(() => result.value?.preference_interpretation || null)
const interpretationTerms = computed(() => {
  const data = interpretation.value
  if (!data) return []
  return [...new Set([
    ...(data.flavors || []).map(term => `Wants ${term}`),
    ...(data.include || []).map(term => `Wants ${term}`),
    ...(data.exclude || []).map(term => `Avoid ${term}`),
  ])]
})
const favoriteRecommendations = computed(() => (result.value?.recommendations || []).filter(item => isFavorite(item)))
const topRecommendations = computed(() => (result.value?.recommendations || []).filter(item => !isFavorite(item)))

function favoriteKey(item) {
  return dishKey({
    id: item.item_id ?? item.id,
    name: item.name,
    location: item.location?.id ?? item.location,
  })
}

function isFavorite(item) {
  const key = favoriteKey(item)
  return Boolean(key && favoriteKeys.value.includes(key))
}

function refreshFavorites(event) {
  if (event && event.detail?.email !== props.email) return
  favoriteKeys.value = readFavorites(props.email).map(favorite => favorite.key)
}

function handleStorage(event) {
  if (event.key === `bu-dish-favorites:${props.email.trim().toLowerCase()}`) refreshFavorites()
}

const isToday = computed(() => date.value === today.value)
const mealOptions = computed(() => [
  ...(isToday.value ? ['current'] : []),
  ...availableMeals.value.filter(name => name.toLocaleLowerCase() !== 'current'),
])

async function refreshAvailableMeals() {
  const requestId = ++availabilityRequest
  availabilityLoading.value = true
  availabilityError.value = ''
  availableMeals.value = []
  try {
    const ranks = await readLocationRanks(props.token)
    const locations = LOCATIONS.filter(location => Object.hasOwn(ranks, location.id)).map(location => location.id)
    if (!locations.length) return
    const response = await getDiningMenus({ token: props.token, date: date.value, meal: 'current', locations })
    if (requestId === availabilityRequest) availableMeals.value = response.availableMeals
  } catch (cause) {
    if (requestId === availabilityRequest) {
      if (cause instanceof ApiError && cause.status === 401) emit('expired')
      else availabilityError.value = cause.message
    }
  } finally {
    if (requestId === availabilityRequest) availabilityLoading.value = false
  }
}

// "Now" only makes sense for today.
watch(isToday, today => {
  if (!today && meal.value === 'current') meal.value = 'Lunch'
})
watch(date, nextDate => {
  if (!dates.value.some(option => option.value === nextDate)) return
  refreshAvailableMeals()
})
watch(mealOptions, options => {
  if (options.length && !options.includes(meal.value)) {
    meal.value = options.includes('Lunch') ? 'Lunch' : options[0]
  }
})

onMounted(() => {
  refreshAvailableMeals()
  window.addEventListener(FAVORITES_EVENT, refreshFavorites)
  window.addEventListener('storage', handleStorage)
  dateRefreshInterval = window.setInterval(() => {
    const currentDate = diningDate()
    if (today.value !== currentDate) today.value = currentDate
  }, 60000)
})
onUnmounted(() => {
  window.removeEventListener(FAVORITES_EVENT, refreshFavorites)
  window.removeEventListener('storage', handleStorage)
  window.clearInterval(dateRefreshInterval)
})

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

    const response = await request('/api/recommend', { method: 'POST', token: props.token, timeout: 60000, body: {
      date: date.value,
      meal: meal.value,
      locations,
    } })
    const seen = new Set()
    const recommendations = response.recommendations.filter(item => {
      const key = `${item.location?.id}:${item.item_id}:${item.meal}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    result.value = { ...response, recommendations, preferenceSummary: Object.entries(response.score_weights || {})
      .map(([key, value]) => `${{ nutrition: 'Nutrition', food: 'Food preferences', location: 'Dining location' }[key]}: ${value}%`) }
    notices.value = response.warnings || []
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      emit('expired')
    } else {
      error.value = cause.message
    }
  } finally {
    loading.value = false
    emit('busy', false)
  }
}
</script>

<template>
  <section
    class="panel"
    aria-labelledby="recommend-title"
    :aria-busy="loading"
  >
    <h2 id="recommend-title">Dish recommendation</h2>
    <p class="intro">This website should not be used for nutritional advice and instead as recommendations</p>
    <p class="intro">{{ beforeRecommend ? 'Save all your current preferences and get AI recommendations in one step.' : 'AI recommendations use your saved dietary needs and preference weights.' }}</p>
    <form novalidate @submit.prevent="submit">
      <div class="field-row">
        <div class="field">
          <label for="rec-date">Day</label>
          <select id="rec-date" v-model="date" :disabled="loading">
            <option
              v-for="option in dates"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="rec-meal">Meal</label>
          <select id="rec-meal" v-model="meal" :disabled="loading">
            <option
              v-for="name in mealOptions"
              :key="name"
              :value="name"
            >
              {{ name === 'current' ? 'Now' : name }}
            </option>
          </select>
        </div>
      </div>
      <p v-if="availabilityLoading" class="hint" role="status">Checking meals scheduled for this day…</p>
      <p v-else-if="availabilityError" class="hint" role="alert">{{ availabilityError }}</p>
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
            <li
              v-for="line in result.preferenceSummary"
              :key="line"
            >
              {{ line }}
            </li>
          </ul>
          <p v-if="result.score_weights?.nutrition === 0" class="hint">To include nutrition, add a target for one dish above and give nutrition a positive weight, then save and recommend again.</p>
        </div>

        <div v-if="interpretationTerms.length" class="preference-summary">
          <h3>How AI read your food preferences</h3>
          <p class="hint">These terms steer ranking only. They never filter dishes out, and dietary needs still apply first.</p>
          <ul class="rec-tags interpretation-terms" aria-label="Interpreted food preferences">
            <li v-for="term in interpretationTerms" :key="term">
              {{ term }}
            </li>
          </ul>
          <p v-if="interpretation.source === 'fallback'" class="hint">
            AI interpretation was unavailable, so keywords were matched literally.
          </p>
        </div>

        <div v-if="result.best_location" class="best-pick">
          <span class="account-label">Best dining hall for you</span>
          <h3>{{ result.best_location.name }}</h3>
          <p>{{ result.summary }}</p>
        </div>

        <p v-else class="intro">
          {{ result.summary }}
        </p>

        <ul
          v-if="notices.length"
          class="warnings"
          aria-label="Recommendation notices"
        >
          <li v-for="notice in notices" :key="notice">
            {{ notice }}
          </li>
        </ul>
        <p v-if="result.fallback && result.recommendations.length" class="hint">
          Our AI assistant was unavailable, so these dishes are ranked by your weighted scores.
        </p>
        <section v-if="favoriteRecommendations.length" class="recommendation-group" aria-labelledby="favorite-recommendations-title">
          <h3 id="favorite-recommendations-title">Favorite dishes</h3>
          <ol class="rec-list favorite-list">
            <RecommendationCard
              v-for="(item, index) in favoriteRecommendations"
              :key="`${item.location.id}:${item.item_id}:${item.meal}:${item.station}:${index}`"
              :item="item"
              :rank="index + 1"
              :email="email"
              :can-add-consumed="isToday"
              @consumed="emit('consumed', { item, date })"
            />
          </ol>
        </section>
        <section v-if="topRecommendations.length" class="recommendation-group" aria-labelledby="top-recommendations-title">
          <h3 id="top-recommendations-title">Top recommendations</h3>
          <ol class="rec-list">
            <RecommendationCard
              v-for="(item, index) in topRecommendations"
              :key="`${item.location.id}:${item.item_id}:${item.meal}:${item.station}:${index}`"
              :item="item"
              :rank="index + 1"
              :email="email"
              :can-add-consumed="isToday"
              @consumed="emit('consumed', { item, date })"
            />
          </ol>
        </section>

        <p class="footnote">
          Menus are provided by BU Dining Services and may change.
          <a v-for="source in sourceUrls" :key="source" :href="source" target="_blank" rel="noopener noreferrer">View menu</a>
        </p>

      </template>
    </div>
  </section>
</template>
