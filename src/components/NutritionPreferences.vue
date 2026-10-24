<script setup>
import { computed, onMounted, ref } from 'vue'

const message = ref('')
const error = ref('')
const nextId = ref(0)
const STORAGE_VERSION = 2
const STORAGE_KEY = 'nutritionPreferences'
const nutrients = [
  { key: 'calories', label: 'Calories', unit: 'kcal', step: '1' },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g', step: '0.1' },
  { key: 'protein', label: 'Protein', unit: 'g', step: '0.1' },
  { key: 'saturated_fat', label: 'Saturated Fat', unit: 'g', step: '0.1' },
]
const entries = ref([])
const availableNutrients = computed(() => nutrients.filter(
  nutrient => !entries.value.some(entry => entry.key === nutrient.key)
))

function addEntry() {
  if (!availableNutrients.value.length) return
  entries.value.push({ id: nextId.value++, key: '', value: '' })
  error.value = ''
  message.value = ''
}

function removeEntry(id) {
  entries.value = entries.value.filter(entry => entry.id !== id)
  error.value = ''
  message.value = ''
}

function savePreferences() {
  message.value = ''
  error.value = ''

  const preferences = {}
  for (const entry of entries.value) {
    if (!entry.key) continue

    if (entry.value === '' || entry.value === null) {
      error.value = `Please enter a value for ${nutrients.find(item => item.key === entry.key).label}.`
      return
    }

    const value = Number(entry.value)
    if (!Number.isFinite(value) || value < 0 || value > 100000) {
      error.value = 'Please enter valid numbers between 0 and 100000.'
      return
    }
    preferences[entry.key] = value
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      goals: preferences,
    }))
    message.value = 'Nutrition preferences saved successfully!'
  } catch {
    error.value = 'Unable to save preferences in this browser.'
  }
}

function loadPreferences() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return

    const stored = JSON.parse(saved)
    if (stored?.version !== STORAGE_VERSION) return
    if (!stored.goals || typeof stored.goals !== 'object' || Array.isArray(stored.goals)) {
      throw new Error('Saved preferences must be an object.')
    }

    entries.value = nutrients
      .filter(nutrient => stored.goals[nutrient.key] !== undefined && stored.goals[nutrient.key] !== null && stored.goals[nutrient.key] !== '')
      .map(nutrient => ({
        id: nextId.value++,
        key: nutrient.key,
        value: String(stored.goals[nutrient.key]),
      }))
  } catch {
    error.value = 'Unable to load saved preferences.'
  }
}

function resetPreferences() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    entries.value = []
    error.value = ''
    message.value = 'Preferences have been reset.'
  } catch {
    error.value = 'Unable to reset preferences.'
  }
}

onMounted(loadPreferences)
</script>

<template>
  <div class="nutrition-container">
    <form @submit.prevent="savePreferences">
      <div v-if="entries.length" class="nutrition-flexbox">
        <div v-for="entry in entries" :key="entry.id" class="nutrition-entry">
          <div class="nutrition-field">
            <label :for="`nutrition-${entry.id}-type`">Nutrition</label>
            <select :id="`nutrition-${entry.id}-type`" v-model="entry.key">
              <option value="">Choose a nutrition</option>
              <option
                v-for="nutrient in nutrients.filter(item => item.key === entry.key || !entries.some(other => other.key === item.key))"
                :key="nutrient.key"
                :value="nutrient.key"
              >
                {{ nutrient.label }}
              </option>
            </select>
          </div>
          <div v-if="entry.key" class="nutrition-field">
            <label :for="`nutrition-${entry.id}-value`">
              {{ nutrients.find(item => item.key === entry.key).label }} goal
            </label>
            <div class="input-wrapper">
              <input
                :id="`nutrition-${entry.id}-value`"
                v-model="entry.value"
                type="number"
                min="0"
                max="100000"
                :step="nutrients.find(item => item.key === entry.key).step"
                required
              />
              <span class="unit">{{ nutrients.find(item => item.key === entry.key).unit }}</span>
            </div>
          </div>
          <button
            type="button"
            class="remove-nutrition"
            :aria-label="`Remove ${entry.key ? nutrients.find(item => item.key === entry.key).label : 'nutrition'} goal`"
            @click="removeEntry(entry.id)"
          >
            Remove
          </button>
        </div>
      </div>

      <button
        type="button"
        class="add-nutrition"
        :disabled="availableNutrients.length === 0"
        @click="addEntry"
      >
        <span aria-hidden="true">+</span> Add nutrition
      </button>

      <!-- Status messages -->
      <p v-if="error" class="error-message" role="alert">
        {{ error }}
      </p>

      <p v-if="message" class="success-message" role="status">
        {{ message }}
      </p>

      <!-- Buttons -->
      <div class="button-container">
        <button type="submit" class="save-button">
          Save Preferences
        </button>

        <button
          type="button"
          class="reset-button"
          @click="resetPreferences"
        >
          Reset
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.nutrition-container {
  width: 100%;
  max-width: 800px;
  margin: 20px auto;
  padding: 24px;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  color: #1f2937;
}

/* Flexbox layout */
.nutrition-flexbox {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.nutrition-field {
  display: flex;
  flex-direction: column;
  flex: 1 1 220px;
  min-width: 0;
  gap: 8px;
}

.nutrition-entry {
  display: flex;
  flex: 1 1 100%;
  align-items: end;
  gap: 12px;
}

.nutrition-entry .nutrition-field {
  flex: 1 1 220px;
}

.nutrition-field label {
  font-size: 14px;
  font-weight: 600;
}

.input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}

.input-wrapper:focus-within {
  border-color: #b71932;
  box-shadow: 0 0 0 2px rgba(183, 25, 50, 0.12);
}

.input-wrapper input {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 12px;
  font-size: 15px;
  color: #111827;
  background: transparent;
  border: none;
  outline: none;
}

.unit {
  padding: 0 12px;
  font-size: 13px;
  color: #6b7280;
}

.button-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.add-nutrition,
.remove-nutrition {
  border: 1px solid #b71932;
  border-radius: 8px;
  color: #b71932;
  background: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.add-nutrition {
  margin-top: 20px;
  padding: 10px 14px;
}

.add-nutrition span {
  margin-right: 4px;
  font-size: 20px;
  line-height: 0;
  vertical-align: -1px;
}

.add-nutrition:hover:not(:disabled),
.remove-nutrition:hover {
  background: #fff8f9;
}

.add-nutrition:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.remove-nutrition {
  min-height: 46px;
  padding: 0 12px;
  border-color: #d1d5db;
  color: #4b5563;
  white-space: nowrap;
}

.save-button,
.reset-button {
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.save-button {
  background: #b71932;
  color: white;
  border: 1px solid #b71932;
}

.save-button:hover {
  background: #931329;
}

.reset-button {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.reset-button:hover {
  background: #f3f4f6;
}

.error-message {
  color: #b91c1c;
  margin-top: 16px;
}

.success-message {
  color: #15803d;
  margin-top: 16px;
}

@media (max-width: 480px) {
  .nutrition-container {
    padding: 16px;
  }

  .nutrition-field {
    flex-basis: 100%;
  }

  .nutrition-entry {
    align-items: stretch;
    flex-direction: column;
  }

  .nutrition-entry .nutrition-field {
    flex-basis: auto;
  }

  .button-container button {
    flex: 1;
  }
}
</style>