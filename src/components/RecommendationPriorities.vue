<script setup>
import { computed, onMounted, ref } from 'vue'
import { ApiError, request } from '../api.js'
import { DEFAULT_PRIORITY_ORDER, readPriorityOrder } from '../recommendationRanking.js'

const props = defineProps({ token: { type: String, required: true }, unified: Boolean })
const emit = defineEmits(['expired'])
const categories = [
  { key: 'food', label: 'Your food preferences', detail: 'Matches foods or keywords you entered.' },
  { key: 'location', label: 'Location preference', detail: 'Uses the location ranks you saved.' },
  { key: 'nutrition', label: 'Nutrition targets', detail: 'Favors dishes closer to your per-serving targets.' },
]
const order = ref({ ...DEFAULT_PRIORITY_ORDER })
const previousOrder = ref({ ...DEFAULT_PRIORITY_ORDER })
const message = ref('')
const error = ref('')
const uniquePriorities = computed(() => new Set(Object.values(order.value).map(Number)).size === categories.length)
const advanced = ref(false)
const weights = ref({ nutrition: 45, food: 35, location: 20 })
const saving = ref(false)
const loaded = ref(false)
const normalizedWeights = computed(() => {
  const total = Object.values(weights.value).reduce((sum, value) => sum + Number(value), 0)
  return Object.fromEntries(categories.map(({ key }) => [key, total ? (Number(weights.value[key]) / total * 100).toFixed(1) : '0.0']))
})

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

function validate() {
  error.value = ''
  if (!loaded.value) {
    error.value = 'Reload your recommendation priorities before recommending.'
  } else if (!uniquePriorities.value) {
    error.value = 'Choose each priority from 1 to 3 exactly once.'
  } else if (advanced.value && categories.every(({ key }) => Number(weights.value[key]) === 0)) {
    error.value = 'Set at least one weight above zero.'
  }
  return !error.value
}

async function savePriorities() {
  if (saving.value || !validate()) return false
  message.value = ''

  try {
    const settings = {
      mode: advanced.value ? 'advanced' : 'default',
      priority_order: Object.fromEntries(categories.map(({ key }) => [key, Number(order.value[key])])),
      custom_weights: Object.fromEntries(categories.map(({ key }) => [key, Number(weights.value[key])])),
    }
    saving.value = true
    await request('/api/recommendation-settings', { method: 'PUT', token: props.token, body: settings })
    localStorage.setItem('recommendationPriorities', JSON.stringify({
      version: 1,
      order: settings.priority_order,
    }))
    message.value = 'Recommendation settings saved.'
    return true
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) emit('expired')
    error.value = cause instanceof Error ? cause.message : 'Unable to save recommendation settings.'
    return false
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const saved = await request('/api/recommendation-settings', { token: props.token })
    order.value = saved.priority_order
    weights.value = saved.custom_weights
    advanced.value = saved.mode === 'advanced'
    if (saved.updatedAt === null) {
      try {
        order.value = readPriorityOrder()
        await request('/api/recommendation-settings', { method: 'PUT', token: props.token, body: {
          mode: 'default', priority_order: order.value, custom_weights: weights.value,
        } })
      } catch { /* Use the server defaults when no valid legacy preference exists. */ }
    }
    previousOrder.value = { ...order.value }
    loaded.value = true
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) emit('expired')
    error.value = cause instanceof Error ? cause.message : 'Unable to load saved recommendation priorities.'
  }
})
defineExpose({ validate, save: savePriorities })
</script>

<template>
  <section class="panel recommendation-priorities" aria-labelledby="priorities-title">
    <h2 id="priorities-title">Recommendation priorities</h2>
    <p class="intro">Dietary labels and excluded dining halls are always applied first. Your order sets default weights: first 45%, second 35%, third 20%.</p>
    <p class="intro">Nutrition targets you enter are included automatically. Blank preferences are excluded, and the remaining weights are rescaled to total 100%.</p>
    <p class="hint">For example, with the default weights, food preferences, and no nutrition targets, food preferences become 63.6%, location 36.4%, and nutrition 0%. Save and recommend applies all your current choices together.</p>
    <form @submit.prevent="!unified && savePriorities()">
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
      <label class="advanced-toggle"><input v-model="advanced" type="checkbox" /> Advanced Mode: customize scoring weights</label>
      <div v-if="advanced" class="advanced-weights">
        <p class="hint">These percentages preview all three configured weights. Results show the weights actually used after excluding inactive preferences, so they may differ.</p>
        <label v-for="category in categories" :key="category.key" class="priority-field" :for="`weight-${category.key}`">
          <span>{{ category.label }} <strong>{{ weights[category.key] }} · {{ normalizedWeights[category.key] }}%</strong></span>
          <input :id="`weight-${category.key}`" v-model.number="weights[category.key]" type="range" min="0" max="100" />
        </label>
        <button type="button" class="secondary" @click="weights = { nutrition: 45, food: 35, location: 20 }">Reset weights</button>
      </div>
      <p v-if="error" class="feedback" role="alert">{{ error }}</p>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <button v-if="!unified" class="primary" type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save priorities' }}</button>
    </form>
  </section>
</template>
