<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError } from '../api.js'
import { DEFAULT_PREFERENCES, getPreferences, savePreferences } from '../dining.js'

const props = defineProps({ token: { type: String, required: true } })
const emit = defineEmits(['expired', 'saved'])

const DIETS = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten_free', label: 'Gluten-free' },
  { key: 'halal', label: 'Halal' },
]
const MAX_LIKES = 300

const form = reactive({ ...DEFAULT_PREFERENCES })
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const status = ref('')
const likesLeft = computed(() => MAX_LIKES - form.likes.length)

function fill(preferences) {
  Object.assign(form, preferences)
}

function fail(cause) {
  if (cause instanceof ApiError && cause.status === 401) emit('expired')
  else error.value = cause.message
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    fill((await getPreferences(props.token)).preferences)
  } catch (cause) {
    fail(cause)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  error.value = ''
  status.value = ''
  const body = {
    vegetarian: form.vegetarian || form.vegan,
    vegan: form.vegan,
    gluten_free: form.gluten_free,
    halal: form.halal,
    // Nutrition goals live in "Daily Nutrition Preferences"; clear any old
    // per-dish limits so they can't keep filtering menus invisibly.
    max_calories: null,
    min_protein: null,
    likes: form.likes.trim(),
  }
  saving.value = true
  try {
    const result = await savePreferences(props.token, body)
    fill(result.preferences)
    status.value = 'Preferences saved.'
    emit('saved', result.preferences)
  } catch (cause) {
    fail(cause)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="panel" aria-labelledby="preferences-title" :aria-busy="loading || saving">
    <h2 id="preferences-title">Your food preferences</h2>
    <p class="intro">We use these to filter menus and personalize recommendations.</p>
    <p v-if="loading" class="intro" role="status">Loading your preferences…</p>
    <form v-else novalidate @submit.prevent="save">
      <fieldset class="choices">
        <legend>Dietary needs</legend>
        <label v-for="diet in DIETS" :key="diet.key" class="check">
          <input v-model="form[diet.key]" type="checkbox" :name="diet.key" :disabled="saving || (diet.key === 'vegetarian' && form.vegan)" />
          <span>{{ diet.label }}</span>
        </label>
        <p class="hint">Only dishes BU Dining labels this way will be recommended. Vegan includes vegetarian.</p>
      </fieldset>
      <div class="field">
        <label for="likes">Foods you like</label>
        <textarea id="likes" v-model="form.likes" rows="3" :maxlength="MAX_LIKES" placeholder="e.g. spicy food, chicken, noodles, no mushrooms" :disabled="saving" aria-describedby="likes-hint"></textarea>
        <p id="likes-hint" class="hint">{{ likesLeft }} characters left. Written in English works best.</p>
      </div>
      <p v-if="error" class="feedback" role="alert">{{ error }}</p>
      <p v-if="status" class="success" role="status">{{ status }}</p>
      <button class="primary" type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save preferences' }}</button>
    </form>
  </section>
</template>
