<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError } from '../api.js'
import { DEFAULT_PREFERENCES, getPreferences, savePreferences } from '../dining.js'

const props = defineProps({ token: { type: String, required: true }, unified: Boolean })
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
const loaded = ref(false)
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
    loaded.value = true
  } catch (cause) {
    fail(cause)
  } finally {
    loading.value = false
  }
}

function validate() {
  error.value = !loaded.value ? 'Reload your dietary preferences before recommending.'
    : form.likes.length > MAX_LIKES ? 'Food preferences must be 300 characters or fewer.' : ''
  return !error.value
}

async function save() {
  if (saving.value || !validate()) return false
  error.value = ''
  status.value = ''
  const body = {
    vegetarian: form.vegetarian || form.vegan,
    vegan: form.vegan,
    gluten_free: form.gluten_free,
    halal: form.halal,
    // Nutrition goals live in their own panel; clear any old
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
    return true
  } catch (cause) {
    fail(cause)
    return false
  } finally {
    saving.value = false
  }
}

onMounted(load)
defineExpose({ validate, save })
</script>

<template>
  <section class="panel" aria-labelledby="preferences-title" :aria-busy="loading || saving">
    <h2 id="preferences-title">Dietary needs</h2>
    <p class="intro">Selected dietary labels are required: dishes without every selected label are excluded.</p>
    <p v-if="loading" class="intro" role="status">Loading your preferences…</p>
    <form v-else novalidate @submit.prevent="!unified && save()">
      <fieldset class="choices">
        <legend>Select all that apply</legend>
        <label v-for="diet in DIETS" :key="diet.key" class="check">
          <input v-model="form[diet.key]" type="checkbox" :name="diet.key" :disabled="saving || (diet.key === 'vegetarian' && form.vegan)" />
          <span>{{ diet.label }}</span>
        </label>
        <p class="hint">Only dishes BU Dining labels this way will be recommended. Vegan includes vegetarian.</p>
      </fieldset>
      <section class="preference-subsection" aria-labelledby="food-preferences-title">
        <h2 id="food-preferences-title">Your food preferences</h2>
        <p class="intro">Enter food names or keywords you like. These influence ranking, but do not filter dishes out.</p>
        <div class="field">
          <label for="likes">Foods or keywords you like</label>
          <textarea id="likes" v-model="form.likes" rows="3" :maxlength="MAX_LIKES" placeholder="e.g. spicy food, chicken, noodles" :disabled="saving" aria-describedby="likes-hint"></textarea>
          <p id="likes-hint" class="hint">{{ likesLeft }} characters left. Separate keywords with commas. Written in English works best.</p>
        </div>
      </section>
      <p v-if="error" class="feedback" role="alert">{{ error }}</p>
      <p v-if="status" class="success" role="status">{{ status }}</p>
      <button v-if="!unified" class="primary" type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save preferences' }}</button>
    </form>
  </section>
</template>
