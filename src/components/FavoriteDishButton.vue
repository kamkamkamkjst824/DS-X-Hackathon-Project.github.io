
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
      :aria-label="favorite ? `Remove ${dish.name} from favorites` : `Add ${dish.name} to favorites`"
      :title="favorite ? 'Remove from favorites' : 'Add to favorites'"
      @click="toggle"
    >
      <span aria-hidden="true">
        {{ favorite ? '★' : '☆' }}
      </span>
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
  display: inline-grid;
  place-items: center;
  align-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid #e8d7a2;
  border-radius: 50%;
  background: #fff9e8;
  color: #9a6b00;
  cursor: pointer;
  font: inherit;
  font-size: 20px;
  line-height: 1;
}

.favorite-button.selected {
  border-color: #e3c766;
  background: #fff2c6;
}

.favorite-button:hover {
  opacity: 0.85;
}

small {
  color: #a0182c;
}
</style>
