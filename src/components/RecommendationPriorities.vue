<script setup>
import { computed, onMounted, ref } from 'vue'
import { DEFAULT_PRIORITY_ORDER, readPriorityOrder } from '../recommendationRanking.js'

const categories = [
  { key: 'food', label: 'Your food preferences', detail: 'Matches foods or keywords you entered.' },
  { key: 'location', label: 'Location preference', detail: 'Uses the location ranks you saved.' },
  { key: 'nutrition', label: 'Daily Nutrition Preferences', detail: 'Favors dishes closer to your selected nutrition goals.' },
]
const order = ref({ ...DEFAULT_PRIORITY_ORDER })
const previousOrder = ref({ ...DEFAULT_PRIORITY_ORDER })
const message = ref('')
const error = ref('')
const uniquePriorities = computed(() => new Set(Object.values(order.value).map(Number)).size === categories.length)

function updatePriority(category) {
  const newPriority = Number(order.value[category])
  const conflictingCategory = categories.find(item => (
    item.key !== category && Number(order.value[item.key]) === newPriority
  ))
  if (conflictingCategory) {
    order.value[conflictingCategory.key] = previousOrder.value[category]
  }
  previousOrder.value = { ...order.value }
  message.value = ''
  error.value = ''
}

function savePriorities() {
  message.value = ''
  error.value = ''
  if (!uniquePriorities.value) {
    error.value = 'Choose each priority from 1 to 3 exactly once.'
    return
  }

  try {
    localStorage.setItem('recommendationPriorities', JSON.stringify({
      version: 1,
      order: Object.fromEntries(categories.map(({ key }) => [key, Number(order.value[key])])),
    }))
    message.value = 'Recommendation priorities saved.'
  } catch {
    error.value = 'Unable to save recommendation priorities in this browser.'
  }
}

onMounted(() => {
  try {
    order.value = readPriorityOrder()
    previousOrder.value = { ...order.value }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load saved recommendation priorities.'
  }
})
</script>

<template>
  <section class="panel recommendation-priorities" aria-labelledby="priorities-title">
    <h2 id="priorities-title">Recommendation priorities</h2>
    <p class="intro">Dietary needs are always applied first as required filters. Rank the other preferences to decide which ones influence dish order most.</p>
    <form @submit.prevent="savePriorities">
      <div v-for="category in categories" :key="category.key" class="priority-field">
        <div>
          <label :for="`priority-${category.key}`">{{ category.label }}</label>
          <p class="hint">{{ category.detail }}</p>
        </div>
        <select
          :id="`priority-${category.key}`"
          v-model="order[category.key]"
          :aria-label="`${category.label} priority`"
          @change="updatePriority(category.key)"
        >
          <option
            v-for="priority in [1, 2, 3]"
            :key="priority"
            :value="priority"
          >
            {{ priority }}
          </option>
        </select>
      </div>
      <p v-if="error" class="feedback" role="alert">{{ error }}</p>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <button class="primary" type="submit">Save priorities</button>
    </form>
  </section>
</template>
