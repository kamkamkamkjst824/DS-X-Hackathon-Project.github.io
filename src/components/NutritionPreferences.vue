<script setup>
import { reactive, ref } from 'vue'

// Field names match the normalized food dictionaries in dining_api.py.
const fields = [
  { key: 'calories', label: 'Calories', unit: 'kcal', step: '1', placeholder: '2000' },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g', step: '0.1', placeholder: '250' },
  { key: 'protein', label: 'Protein', unit: 'g', step: '0.1', placeholder: '100' },
  { key: 'saturated_fat', label: 'Saturated fat', unit: 'g', step: '0.1', placeholder: '20' },
]

const values = reactive({ calories: '', carbs: '', protein: '', saturated_fat: '' })
const saving = ref(false)
const message = ref('')
const error = ref('')
const emit = defineEmits(['saved'])

async function savePreferences() {
  message.value = ''
  error.value = ''
  const payload = {}
  for (const field of fields) {
    const raw = String(values[field.key]).trim()
    if (raw === '') {
      error.value = `Please enter ${field.label.toLowerCase()}.`
      return
    }
    const number = Number(raw)
    if (!Number.isFinite(number) || number < 0) {
      error.value = `${field.label} must be a non-negative number.`
      return
    }
    payload[field.key] = number
  }
  saving.value = true
  try {
    const response = await fetch('http://127.0.0.1:8000/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not save preferences.')
    message.value = 'Nutrition preferences saved!'
    emit('saved', result.preferences)
  } catch (err) {
    error.value = err instanceof TypeError
      ? 'Cannot reach the Python server. Start preferences_server.py on port 8000.'
      : err.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="nutrition-panel" aria-labelledby="nutrition-heading">
    <div class="panel-heading">
      <span class="eyebrow">PERSONALIZE YOUR DAY</span>
      <h2 id="nutrition-heading">Your nutrition goals</h2>
      <p>Enter your preferred daily nutrition targets to help plan your meals.</p>
    </div>

    <form class="nutrition-form" @submit.prevent="savePreferences">
      <div class="nutrition-fields">
        <label v-for="field in fields" :key="field.key" class="nutrition-field">
          <span class="field-label">{{ field.label }}</span>
          <span class="input-wrap">
            <input
              v-model="values[field.key]"
              type="number"
              min="0"
              :step="field.step"
              :placeholder="field.placeholder"
              required
            />
            <span class="unit">{{ field.unit }}</span>
          </span>
        </label>
      </div>
      <p class="helper">These are goals, not medical recommendations. Values are stored by the local demo backend.</p>
      <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
      <p v-if="message" class="feedback success" role="status">{{ message }}</p>
      <button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save preferences' }}</button>
    </form>
  </section>
</template>

<style scoped>
.nutrition-panel { box-sizing: border-box; width: min(100%, 760px); padding: 30px; border: 1px solid #eadfe0; border-radius: 20px; background: #fff; box-shadow: 0 12px 35px #39112010; color: #252329; font-family: Inter, system-ui, -apple-system, sans-serif; }
.eyebrow { color: #ae1c32; font-size: 11px; font-weight: 800; letter-spacing: .15em; }
.panel-heading h2 { margin: 10px 0 5px; font-size: clamp(24px, 4vw, 30px); letter-spacing: -.035em; }
.panel-heading p { color: #68636b; margin: 0 0 25px; line-height: 1.5; }
.nutrition-form { display: flex; flex-direction: column; gap: 15px; }
.nutrition-fields { display: flex; flex-wrap: wrap; gap: 15px; }
.nutrition-field { display: flex; flex: 1 1 220px; flex-direction: column; min-width: 0; gap: 8px; }
.field-label { font-size: 13px; font-weight: 700; }
.input-wrap { display: flex; align-items: center; background: #faf8f8; border: 1px solid #ded9db; border-radius: 10px; padding-right: 14px; }
.input-wrap:focus-within { outline: 2px solid #b71932; outline-offset: 1px; }
input { flex: 1; min-width: 0; width: 100%; border: 0; outline: none; background: transparent; padding: 14px; font: inherit; font-size: 16px; color: inherit; }
.unit { font-size: 12px; color: #77717a; }
.helper { margin: 0; font-size: 12px; color: #77717a; line-height: 1.5; }
.feedback { margin: 0; font-size: 13px; }
.error { color: #ae1c32; }
.success { color: #17683a; }
button { align-self: flex-start; border: 0; border-radius: 10px; background: #b71932; color: #fff; font: inherit; font-weight: 700; padding: 13px 22px; cursor: pointer; }
button:disabled { opacity: .65; cursor: wait; }
button:not(:disabled):hover { background: #8d1728; }
@media (max-width: 480px) { .nutrition-panel { padding: 20px; } .nutrition-field { flex-basis: 100%; } button { align-self: stretch; } }
</style>
