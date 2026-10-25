
<script setup>
import {
  ref,
  onMounted,
  onUnmounted,
  watch
} from 'vue'

import {
  FAVORITES_EVENT,
  readFavorites,
  toggleFavorite
} from '../utils/dishFavorites.js'

const props = defineProps({
  email: {
    type: String,
    default: ''
  },
  token: {
    type: String,
    default: ''
  }
})

const open = ref(false)
const loading = ref(false)
const error = ref('')
const firstChoice = ref('N/A')
const favoriteDishes = ref([])
const favoriteError = ref('')
const dietaryNeeds = ref([])
const root = ref(null)

const diningHallNames = {
  warren: 'Warren Towers',
  west: 'West Campus',
  marciano: 'Marciano Commons'
}

const dietaryLabels = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten_free', label: 'Gluten-free' },
  { key: 'halal', label: 'Halal' }
]

const apiBase = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://bu-auth-worker.tangyingkai120.workers.dev'
).replace(/\/$/, '')

let requestId = 0

function display(value) {
  if (typeof value === 'string') {
    return value.trim() || 'N/A'
  }

  if (Array.isArray(value)) {
    return value
      .map(v => String(v).trim())
      .filter(Boolean)
      .join(', ') || 'N/A'
  }

  return 'N/A'
}

function yes(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true'
  )
}

function savedPreferences(body) {
  if (
    body?.preferences &&
    !Array.isArray(body.preferences) &&
    typeof body.preferences === 'object'
  ) {
    return body.preferences
  }

  return body ?? {}
}

function refreshFavorites() {
  favoriteDishes.value = readFavorites(props.email)
}

function onFavoritesChange(event) {
  if (event.detail?.email === props.email) {
    refreshFavorites()
  }
}

function onStorage(event) {
  if (event.key?.startsWith('bu-dish-favorites:')) {
    refreshFavorites()
  }
}

function removeFavorite(dish) {
  try {
    toggleFavorite(props.email, dish)
    favoriteError.value = ''
  } catch (cause) {
    favoriteError.value = cause.message
  }
}

async function getSaved(path) {
  const response = await fetch(
    `${apiBase}${path}`,
    {
      headers: {
        Authorization: `Bearer ${props.token}`,
        Accept: 'application/json'
      }
    }
  )

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status})`
    )
  }

  return response.json()
}

async function refreshProfile() {
  const current = ++requestId

  loading.value = true
  error.value = ''
  firstChoice.value = 'N/A'
  dietaryNeeds.value = []

  refreshFavorites()

  if (!props.token) {
    error.value =
      'Sign in to view your saved preferences.'
    loading.value = false
    return
  }

  const [locationResult, preferenceResult] =
    await Promise.allSettled([
      getSaved('/api/location-preferences'),
      getSaved('/api/preferences')
    ])

  if (current !== requestId) return

  if (locationResult.status === 'fulfilled') {
    const body = locationResult.value

    const locations = Array.isArray(body)
      ? body
      : (
          body?.preferences ??
          body?.locations ??
          []
        )

    if (Array.isArray(locations)) {
      const top = locations.find(
        item => Number(item?.rank) === 1
      )

      if (top?.location) {
        const location = top.location.toLowerCase()

        firstChoice.value =
          diningHallNames[location] ??
          display(top.location)
      }
    }
  }

  if (preferenceResult.status === 'fulfilled') {
    const data = savedPreferences(
      preferenceResult.value
    )

    dietaryNeeds.value = dietaryLabels
      .filter(({ key }) => yes(data[key]))
      .map(({ label }) => label)
  }

  if (
    locationResult.status === 'rejected' ||
    preferenceResult.status === 'rejected'
  ) {
    error.value =
      'Some saved preferences could not be loaded. Close and reopen your profile to retry.'
  }

  loading.value = false
}

function toggle() {
  open.value = !open.value

  if (open.value) {
    refreshProfile()
  }
}

function onOutside(event) {
  if (
    open.value &&
    root.value &&
    !root.value.contains(event.target)
  ) {
    open.value = false
  }
}

function onEscape(event) {
  if (event.key === 'Escape') {
    open.value = false
  }
}

function onFocus() {
  if (open.value) {
    refreshProfile()
  }
}

watch(
  () => props.token,
  () => {
    requestId++
    open.value = false
    firstChoice.value = 'N/A'
    refreshFavorites()
    dietaryNeeds.value = []
  }
)

onMounted(() => {
  document.addEventListener(
    'pointerdown',
    onOutside
  )

  document.addEventListener(
    'keydown',
    onEscape
  )

  window.addEventListener('focus', onFocus)

  window.addEventListener(
    FAVORITES_EVENT,
    onFavoritesChange
  )

  window.addEventListener(
    'storage',
    onStorage
  )
})

onUnmounted(() => {
  requestId++

  document.removeEventListener(
    'pointerdown',
    onOutside
  )

  document.removeEventListener(
    'keydown',
    onEscape
  )

  window.removeEventListener('focus', onFocus)

  window.removeEventListener(
    FAVORITES_EVENT,
    onFavoritesChange
  )

  window.removeEventListener(
    'storage',
    onStorage
  )
})
</script>

<template>
  <div ref="root" class="profile-menu">

    <!-- Profile button -->
    <button
      class="profile-button"
      type="button"
      aria-label="Open profile"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path
          d="M4 21c0-4.5 3.1-7 8-7s8 2.5 8 7"
        />
      </svg>

      <span>Profile</span>
    </button>

    <!-- Profile dropdown -->
    <section
      v-if="open"
      class="profile-card"
      role="dialog"
      aria-label="Your profile"
    >
      <div class="card-header">
        <h2>Your profile</h2>

        <button
          class="close-button"
          type="button"
          aria-label="Close profile"
          @click="open = false"
        >
          ×
        </button>
      </div>

      <p
        v-if="loading"
        class="status"
        role="status"
      >
        Loading saved preferences…
      </p>

      <dl>

        <!-- Email -->
        <div class="profile-field">
          <dt>Email</dt>
          <dd>{{ display(email) }}</dd>
        </div>

        <!-- Preferred dining hall -->
        <div class="profile-field">
          <dt>First-choice dining hall</dt>
          <dd>{{ firstChoice }}</dd>
        </div>

        <!-- Favorite dishes -->
        <div class="profile-field">
          <dt>Favorite dishes</dt>

          <dd v-if="!favoriteDishes.length">
            N/A
          </dd>

          <dd v-else>
            <ul class="favorites-list">
              <li
                v-for="dish in favoriteDishes"
                :key="dish.key"
                class="favorite-row"
              >
                <span>
                  <strong>{{ dish.name }}</strong>

                  <small>
                    {{
                      diningHallNames[
                        dish.location?.toLowerCase()
                      ] || dish.location
                    }}
                  </small>
                </span>

                <button
                  type="button"
                  class="unfavorite"
                  :aria-label="`Unfavorite ${dish.name}`"
                  @click="removeFavorite(dish)"
                >
                  ♥ Remove
                </button>
              </li>
            </ul>
          </dd>

          <p
            v-if="favoriteError"
            class="error"
            role="alert"
          >
            {{ favoriteError }}
          </p>
        </div>

        <!-- Dietary needs -->
        <div class="profile-field">
          <dt>Dietary needs</dt>

          <dd
            v-if="dietaryNeeds.length"
            class="diet-tags"
          >
            <span
              v-for="tag in dietaryNeeds"
              :key="tag"
              class="diet-tag"
            >
              {{ tag }}
            </span>
          </dd>

          <dd v-else>N/A</dd>
        </div>

      </dl>

      <p
        v-if="error"
        class="error"
        role="alert"
      >
        {{ error }}
      </p>

    </section>
  </div>
</template>

<style scoped>
.profile-menu {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 50;
  font-family: inherit;
}

.profile-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid #e4c5ca;
  background: #fff;
  color: #97152a;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  box-shadow: 0 2px 8px #0000000b;
}

.profile-button:hover,
.profile-button:focus-visible {
  background: #fff3f5;
  outline-offset: 2px;
}

.profile-button svg {
  width: 18px;
  height: 18px;
}

.profile-card {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(340px, calc(100vw - 32px));
  box-sizing: border-box;
  border: 1px solid #e8dadd;
  border-radius: 14px;
  background: white;
  color: #222;
  padding: 20px;
  box-shadow: 0 16px 35px #00000024;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-header h2 {
  font-size: 19px;
  margin: 0;
  color: #99172c;
}

.close-button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: #555;
  font-size: 27px;
  line-height: 1;
  padding: 2px 7px;
}

dl {
  margin: 0;
}

.profile-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 0;
  border-bottom: 1px solid #f0eaeb;
}

.profile-field:last-child {
  border-bottom: none;
}

dt {
  font-size: 12px;
  font-weight: 700;
  color: #6a6570;
}

dd {
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.diet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.diet-tag {
  display: inline-flex;
  background: #fff1f3;
  color: #92152d;
  border: 1px solid #ecc8d0;
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 600;
}

.favorites-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-height: 230px;
  overflow-y: auto;
}

.favorite-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.favorite-row strong {
  font-size: 13px;
  display: block;
}

.favorite-row small {
  font-size: 11px;
  color: #777;
  display: block;
}

.unfavorite {
  flex-shrink: 0;
  border: 1px solid #e8c2ca;
  border-radius: 99px;
  background: white;
  color: #97152a;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 11px;
}

.status {
  font-size: 13px;
  color: #6a6570;
}

.error {
  color: #a0182c;
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 520px) {
  .profile-menu {
    top: 10px;
    right: 10px;
  }

  .profile-button {
    padding: 8px 10px;
  }
}
</style>
