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

const complete = computed(() => Object.values(ranks.value).every(Boolean))
const uniqueRanks = computed(() => new Set(Object.values(ranks.value)).size === locations.length)

async function savePreferences() {
  if (!complete.value || !uniqueRanks.value) {
    message.value = 'Choose a different rank for each location.'
    return
  }

  const preferences = locations
    .map(({ id }) => ({ rank: Number(ranks.value[id]), location: id }))
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
  <main>
    <h1>Location preference</h1>
    <p>Rank each dining location from 1 (top choice) to 3.</p>

    <form @submit.prevent="savePreferences">
      <div v-for="location in locations" :key="location.id">
        <label :for="location.id">{{ location.name }}</label>
        <select
          :id="location.id"
          v-model="ranks[location.id]"
          required
          @change="message = ''"
        >
          <option value="" disabled>Select rank</option>
          <option
            v-for="rank in [1, 2, 3]"
            :key="rank"
            :value="rank"
            :disabled="Object.entries(ranks).some(([id, selected]) => id !== location.id && selected === rank)"
          >
            {{ rank }}
          </option>
        </select>
      </div>

      <button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save preference' }}</button>
    </form>

    <p role="status">{{ message }}</p>
  </main>
</template>
