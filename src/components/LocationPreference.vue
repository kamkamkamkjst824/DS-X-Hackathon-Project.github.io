<script setup>
import { computed, onMounted, ref } from 'vue'

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

const rankedLocations = computed(() => Object.entries(ranks.value)
  .filter(([, rank]) => rank !== '' && rank !== 'excluded'))
const uniqueRanks = computed(() => {
  const selectedRanks = rankedLocations.value.map(([, rank]) => Number(rank))
  return new Set(selectedRanks).size === selectedRanks.length
})

async function savePreferences() {
  if (!rankedLocations.value.length || !uniqueRanks.value) {
    message.value = rankedLocations.value.length
      ? 'Each included location must have a unique rank from 1 to 3.'
      : 'Choose at least one location to include in recommendations.'
    return
  }

  const preferences = rankedLocations.value
    .map(([location, rank]) => ({ rank: Number(rank), location }))
    .sort((first, second) => first.rank - second.rank)
  saving.value = true
  message.value = ''

  try {
    const response = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    })
    if (!response.ok) {
      throw new Error(`Save failed (${response.status}).`)
    }
    message.value = 'Preference saved.'
  } catch (error) {
    message.value = error instanceof Error
      ? `${error.message} Make sure the Python preference server is running.`
      : 'Could not save preference. Make sure the Python preference server is running.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const response = await fetch('/api/preferences')
    if (!response.ok) throw new Error(`Load failed (${response.status}).`)
    const { preferences } = await response.json()

    for (const { id } of locations) ranks.value[id] = 'excluded'
    for (const { rank, location } of preferences) {
      if (Object.hasOwn(ranks.value, location) && [1, 2, 3].includes(rank)) {
        ranks.value[location] = String(rank)
      }
    }
  } catch (error) {
    message.value = error instanceof Error
      ? `${error.message} Make sure the Python preference server is running.`
      : 'Could not load saved preference. Make sure the Python preference server is running.'
  }
})
</script>

<template>
  <section class="location-preferences" aria-labelledby="location-preferences-title">
    <h2 id="location-preferences-title">Location preference</h2>
    <p class="location-preferences-intro">Rank locations you want included. Choose “Don't want” to exclude a location from recommendations.</p>

    <form @submit.prevent="savePreferences">
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

      <button class="primary" type="submit" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save preference' }}
      </button>
    </form>

    <p v-if="message" class="location-preferences-message" role="status">{{ message }}</p>
  </section>
</template>
