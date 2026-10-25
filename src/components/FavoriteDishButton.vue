
<script setup>
import {
  ref,
  watch,
  onMounted,
  onUnmounted
} from 'vue'

import {
  FAVORITES_EVENT,
  isFavorite,
  toggleFavorite
} from '../utils/dishFavorites.js'

const props = defineProps({
  dish: {
    type: Object,
    required: true
  },
  email: {
    type: String,
    required: true
  }
})

const favorite = ref(false)
const error = ref('')

function refresh() {
  favorite.value = isFavorite(
    props.email,
    props.dish
  )
}

function onChanged(event) {
  if (event.detail?.email === props.email) {
    refresh()
  }
}

function onStorage(event) {
  if (event.key?.startsWith('bu-dish-favorites:')) {
    refresh()
  }
}

function toggle() {
  try {
    toggleFavorite(props.email, props.dish)
    error.value = ''
  } catch (cause) {
    error.value = cause.message
  }
}

watch(
  () => [props.email, props.dish],
  refresh,
  { deep: true }
)

onMounted(() => {
  refresh()

  window.addEventListener(
    FAVORITES_EVENT,
    onChanged
  )

  window.addEventListener(
    'storage',
    onStorage
  )
})

onUnmounted(() => {
  window.removeEventListener(
    FAVORITES_EVENT,
    onChanged
  )

  window.removeEventListener(
    'storage',
    onStorage
  )
})
</script>

<template>
  <div class="favorite-control">
    <button
      type="button"
      class="favorite-button"
      :class="{ selected: favorite }"
      :aria-pressed="favorite"
      @click="toggle"
    >
      <span aria-hidden="true">
        {{ favorite ? '♥' : '♡' }}
      </span>

      {{ favorite ? 'Unfavorite' : 'Favorite' }}
    </button>

    <small v-if="error" role="alert">
      {{ error }}
    </small>
  </div>
</template>

<style scoped>
.favorite-control {
  display: inline-flex;
  flex-direction: column;
  gap: 3px;
}

.favorite-button {
  display: inline-flex;
  gap: 6px;
  align-items: center;

  border: 1px solid #b71932;
  background: white;
  color: #b71932;

  border-radius: 999px;
  padding: 7px 12px;

  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.favorite-button.selected {
  background: #b71932;
  color: white;
}

.favorite-button:hover {
  opacity: 0.85;
}

small {
  color: #a0182c;
}
</style>
