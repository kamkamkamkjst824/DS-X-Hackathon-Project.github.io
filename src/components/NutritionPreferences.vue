
<script setup>
import { ref, onMounted } from 'vue'

// Nutrition preferences matching dining_api.py
const calories = ref('')
const carbs = ref('')
const protein = ref('')
const saturatedFat = ref('')

const message = ref('')
const error = ref('')

// Save preferences in the browser
function savePreferences() {
  message.value = ''
  error.value = ''

  const fields = [
    calories.value,
    carbs.value,
    protein.value,
    saturatedFat.value
  ]

  // Check for empty inputs
  if (fields.some(value => value === '' || value === null)) {
    error.value = 'Please fill in all nutrition fields.'
    return
  }

  const numbers = fields.map(Number)

  // Validate nutrition inputs
  if (numbers.some(value => !Number.isFinite(value) || value < 0)) {
    error.value = 'Please enter valid, non-negative numbers.'
    return
  }

  const preferences = {
    calories: numbers[0],
    carbs: numbers[1],
    protein: numbers[2],
    saturated_fat: numbers[3]
  }

  try {
    localStorage.setItem(
      'nutritionPreferences',
      JSON.stringify(preferences)
    )

    message.value = 'Nutrition preferences saved successfully!'
  } catch {
    error.value = 'Unable to save preferences in this browser.'
  }
}

// Load previously saved preferences
function loadPreferences() {
  try {
    const saved = localStorage.getItem('nutritionPreferences')

    if (!saved) return

    const preferences = JSON.parse(saved)

    calories.value = preferences.calories ?? ''
    carbs.value = preferences.carbs ?? ''
    protein.value = preferences.protein ?? ''
    saturatedFat.value = preferences.saturated_fat ?? ''
  } catch {
    error.value = 'Unable to load saved preferences.'
  }
}

// Reset preferences
function resetPreferences() {
  try {
    localStorage.removeItem('nutritionPreferences')

    calories.value = ''
    carbs.value = ''
    protein.value = ''
    saturatedFat.value = ''

    error.value = ''
    message.value = 'Preferences have been reset.'
  } catch {
    error.value = 'Unable to reset preferences.'
  }
}

// Automatically load when component appears
onMounted(loadPreferences)
</script>

<template>
  <div class="nutrition-container">
    <div class="nutrition-header">
      <h2>Daily Nutrition Preferences</h2>
      <p>
        Enter your preferred daily nutrition goals to help
        personalize your dining recommendations.
      </p>
    </div>

    <form @submit.prevent="savePreferences">
      <div class="nutrition-flexbox">

        <!-- Calories -->
        <div class="nutrition-field">
          <label for="calories">Calories</label>
          <div class="input-wrapper">
            <input
              id="calories"
              v-model="calories"
              type="number"
              min="0"
              max="100000"
              step="1"
              placeholder="2000"
              required
            />
            <span class="unit">kcal</span>
          </div>
        </div>

        <!-- Carbohydrates -->
        <div class="nutrition-field">
          <label for="carbs">Carbohydrates</label>
          <div class="input-wrapper">
            <input
              id="carbs"
              v-model="carbs"
              type="number"
              min="0"
              max="100000"
              step="0.1"
              placeholder="250"
              required
            />
            <span class="unit">g</span>
          </div>
        </div>

        <!-- Protein -->
        <div class="nutrition-field">
          <label for="protein">Protein</label>
          <div class="input-wrapper">
            <input
              id="protein"
              v-model="protein"
              type="number"
              min="0"
              max="100000"
              step="0.1"
              placeholder="100"
              required
            />
            <span class="unit">g</span>
          </div>
        </div>

        <!-- Saturated Fat -->
        <div class="nutrition-field">
          <label for="saturated-fat">Saturated Fat</label>
          <div class="input-wrapper">
            <input
              id="saturated-fat"
              v-model="saturatedFat"
              type="number"
              min="0"
              max="100000"
              step="0.1"
              placeholder="20"
              required
            />
            <span class="unit">g</span>
          </div>
        </div>

      </div>

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

.nutrition-header {
  margin-bottom: 24px;
}

.nutrition-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: #b71932;
  margin: 0 0 10px;
}

.nutrition-header p {
  font-size: 14px;
  color: #6b7280;
  line-height: 1.6;
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

  .button-container button {
    flex: 1;
  }
}
</style>
