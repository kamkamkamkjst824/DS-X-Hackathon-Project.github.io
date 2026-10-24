<script setup>
import { computed, ref, watch } from 'vue'
import { ApiError } from '../api.js'
import { LOCATIONS, MAX_DAYS_AHEAD, MEALS, diningDate, getDiningMenus, getPreferences } from '../dining.js'
import RecommendationCard from './RecommendationCard.vue'
import { NUTRITION_TOLERANCE, rankRecommendations, readLocationRanks, readNutritionGoals, readPriorityOrder } from '../recommendationRanking.js'

const props = defineProps({ token: { type: String, required: true } })
const emit = defineEmits(['expired'])

const MAX_RECOMMENDATIONS = 40
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
  try {
    const [savedPreferences, nutritionGoals, locationRanks, priorityOrder] = await Promise.all([
      getPreferences(props.token),
      readNutritionGoals(props.token),
      readLocationRanks(props.token),
      Promise.resolve(readPriorityOrder()),
    ])
    const locations = LOCATIONS
      .filter(location => Object.hasOwn(locationRanks, location.id))
      .map(location => location.id)
    if (!locations.length) {
      throw new Error('Choose at least one location in Location preference before requesting recommendations.')
    }

    const response = await getDiningMenus({
      token: props.token,
      date: date.value,
      meal: meal.value,
      locations,
    })
    const ranked = rankRecommendations(response.recommendations, {
      preferences: savedPreferences.preferences,
      nutritionGoals,
      locationRanks,
      priorityOrder,
    })
    const alternatives = ranked.recommendations
      .filter(item => item.preferenceMatch.keywordMatches === 0)
      .slice(0, 3)
      .map(item => item.name)
    const orderedLocations = Object.entries(ranked.locationRanks)
      .sort((a, b) => a[1] - b[1])
      .map(([id, rank]) => `${LOCATIONS.find(location => location.id === id)?.name || id} (${rank})`)
    const excludedLocations = LOCATIONS
      .filter(location => !Object.hasOwn(ranked.locationRanks, location.id))
      .map(location => location.name)
    const generatedNotices = [
      ...response.warnings,
      ...(response.staleLocations.length
        ? [`Some menu data may be stale for: ${response.staleLocations.join(', ')}.`]
        : []),
      ...(ranked.recommendations.length < response.recommendations.length
        ? [`Excluded ${response.recommendations.length - ranked.recommendations.length} dish(es) that did not meet all selected dietary labels.`]
        : []),
      ...ranked.missingKeywords.map(keyword => {
        const alternativeText = alternatives.length
          ? `Here are some alternatives: ${alternatives.join(', ')}.`
          : 'No alternatives were returned for this meal.'
        return `“${keyword}” was not found in the returned menu; ${alternativeText}`
      }),
    ]
    const topDish = ranked.recommendations[0]
    const preferencesText = [
      ranked.dietaryNeeds.length
        ? `Dietary labels (priority 1): ${ranked.dietaryNeeds.map(diet => diet.label).join(', ')}.`
        : 'Dietary labels (priority 1): none selected.',
      ranked.keywords.length
        ? `Food keywords (preference priority ${priorityOrder.food}): ${ranked.foundKeywords.length ? ranked.foundKeywords.join(', ') : 'no keyword matched; no ranking penalty applied'}.`
        : `Food keywords (preference priority ${priorityOrder.food}): none entered.`,
      ranked.nutritionGoals.length
        ? `Nutrition goals (preference priority ${priorityOrder.nutrition}): ${ranked.nutritionGoals.map(goal => `${goal.label} ${goal.value}`).join(', ')}; dishes within ${NUTRITION_TOLERANCE * 100}% rank higher.`
        : `Nutrition goals (preference priority ${priorityOrder.nutrition}): none selected.`,
      `Dining location order (preference priority ${priorityOrder.location}): ${orderedLocations.join(', ')}${excludedLocations.length ? `; excluded: ${excludedLocations.join(', ')}` : ''}.`,
    ]

    result.value = {
      ...response,
      recommendations: ranked.recommendations.slice(0, MAX_RECOMMENDATIONS),
      best_location: topDish?.location || null,
      summary: topDish
        ? `Top match: ${topDish.name} at ${topDish.location.name}.`
        : 'No menu items match all selected dietary labels for this meal.',
      preferenceSummary: preferencesText,
    }
    notices.value = generatedNotices
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
    <h2 id="recommend-title">Dish recommendation</h2>
    <p class="intro">Find and rank dishes using your saved food, nutrition, and location preferences.</p>
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
      <button class="primary" type="submit" :disabled="loading">{{ loading ? 'Finding dishes…' : 'Dish recommendation' }}</button>
    </form>

    <div class="results" aria-live="polite">
      <p v-if="loading" class="intro" role="status">Checking menus and ranking dishes. This can take a few seconds…</p>
      <template v-else-if="result">
        <div class="preference-summary">
          <h3>How your preferences were applied</h3>
          <ul>
            <li v-for="line in result.preferenceSummary" :key="line">{{ line }}</li>
          </ul>
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
          Our AI assistant was unavailable, so these dishes are ranked by your saved preferences.
        </p>
        <ul v-if="result.warnings.length" class="warnings" aria-label="Notices">
          <li v-for="warning in result.warnings" :key="warning">{{ warning }}</li>
        </ul>
        <ol v-if="result.recommendations.length" class="rec-list">
          <RecommendationCard v-for="(item, index) in result.recommendations" :key="`${item.location.id}:${item.item_id}`" :item="item" :rank="index + 1" />
        </ol>
        <p class="footnote">
          Menus are provided by BU Dining Services and may change.
          <a v-for="source in result.sourceUrls" :key="source" :href="source" target="_blank" rel="noopener noreferrer">View menu</a>
        </p>
      </template>
    </div>
  </section>
</template>
