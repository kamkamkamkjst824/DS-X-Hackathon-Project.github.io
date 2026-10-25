<script setup>
import { computed, onMounted, ref } from 'vue'
import { ApiError, request } from '../api.js'

const props = defineProps({ token: { type: String, required: true }, unified: Boolean })
const emit = defineEmits(['expired'])

const locations = [
  { id: 'warren', name: 'Warren Towers' },
  { id: 'west', name: 'West Campus' },
  { id: 'marciano', name: 'Marciano Commons' },
]

const ranks = ref({
  warren: '',
  west: '',
  marciano: '',
})
const message = ref('')
const saving = ref(false)
const loaded = ref(false)

const rankedLocations = computed(() => Object.entries(ranks.value)
  .filter(([, rank]) => rank !== '' && rank !== 'excluded'))
const uniqueRanks = computed(() => {
  const selectedRanks = rankedLocations.value.map(([, rank]) => Number(rank))
  return new Set(selectedRanks).size === selectedRanks.length
})

function validate() {
  if (!loaded.value) {
    message.value = 'Reload your location preferences before recommending.'
    return false
  }
  if (!rankedLocations.value.length || !uniqueRanks.value) {
    message.value = rankedLocations.value.length
      ? 'Each included location must have a unique rank from 1 to 3.'
      : 'Choose at least one location to include in recommendations.'
    return false
  }
  return true
}

async function savePreferences() {
  if (saving.value || !validate()) return false

  const preferences = rankedLocations.value
    .map(([location, rank]) => ({ rank: Number(rank), location }))
    .sort((first, second) => first.rank - second.rank)
  saving.value = true
  message.value = ''

  try {
    await request('/api/location-preferences', {
      method: 'PUT',
      token: props.token,
      body: { preferences },
    })
    message.value = 'Preference saved.'
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) emit('expired')
    message.value = error instanceof Error
      ? error.message
      : 'Could not save preference. Please try again.'
    return false
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const { preferences } = await request('/api/location-preferences', { token: props.token })

    for (const { id } of locations) ranks.value[id] = 'excluded'
    for (const { rank, location } of preferences) {
      if (Object.hasOwn(ranks.value, location) && [1, 2, 3].includes(rank)) {
        ranks.value[location] = String(rank)
      }
    }
    loaded.value = true
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) emit('expired')
    message.value = error instanceof Error
      ? error.message
      : 'Could not load saved preference. Please try again.'
  }
})
defineExpose({ validate, save: savePreferences })
</script>

<template>
  <section class="location-preferences" aria-labelledby="location-preferences-title">
    <h2 id="location-preferences-title">Location preference</h2>
    <p class="location-preferences-intro">Rank locations you want included. Choose “Don't want” to exclude a location from recommendations.</p>

    <form @submit.prevent="!unified && savePreferences()">
      <div v-for="location in locations" :key="location.id" class="location-preference-field">
        <label :for="`preference-${location.id}`">{{ location.name }}</label>
        <select
          :id="`preference-${location.id}`"
          v-model="ranks[location.id]"
          @change="message = ''"
        >
          <option value="">Choose preference</option>
          <option
            v-for="rank in [1, 2, 3]"
            :key="rank"
            :value="rank"
            :disabled="Object.entries(ranks).some(([id, selected]) => id !== location.id && Number(selected) === rank)"
          >
            {{ rank }}
          </option>
          <option value="excluded">Don't want</option>
        </select>
      </div>

      <button v-if="!unified" class="primary" type="submit" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save preference' }}
      </button>
    </form>

    <p v-if="message" class="location-preferences-message" role="status">{{ message }}</p>
  </section>
</template>
