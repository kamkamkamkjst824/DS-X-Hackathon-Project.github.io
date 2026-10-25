<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
})

const rating = ref(0)

function getItemId() {
  return props.item.item_id ?? props.item.id
}

function loadRating() {
  try {
    const ratings = JSON.parse(
      localStorage.getItem('dishRatings') || '{}'
    )

    rating.value = ratings[getItemId()]?.rating || 0
  } catch {
    rating.value = 0
  }
}

function rateDish(stars) {
  rating.value = stars

  try {
    const ratings = JSON.parse(
      localStorage.getItem('dishRatings') || '{}'
    )

    ratings[getItemId()] = {
      item_id: getItemId(),
      name: props.item.name,
      rating: stars,

      location:
        props.item.location?.id ??
        props.item.location?.name ??
        '',

      meal: props.item.meal ?? '',
      station: props.item.station ?? '',

      calories:
        props.item.nutrition?.calories ?? null,

      protein:
        props.item.nutrition?.protein_grams ?? null,

      carbs:
        props.item.nutrition?.carbs_grams ?? null,

      saturated_fat:
        props.item.nutrition?.saturated_fat_grams ?? null,

      vegetarian:
        props.item.tags?.vegetarian ?? false,

      vegan:
        props.item.tags?.vegan ?? false,

      gluten_free:
        props.item.tags?.gluten_free ?? false,

      halal:
        props.item.tags?.halal ?? false,

      cool_food:
        props.item.tags?.cool_food ?? false,

      timestamp: new Date().toISOString(),
    }

    localStorage.setItem(
      'dishRatings',
      JSON.stringify(ratings)
    )
  } catch {
    // Keep the visible rating even if storage fails.
  }
}

watch(
  () => getItemId(),
  loadRating,
  { immediate: true }
)
</script>

<template>
  <div class="dish-rating">
    <span class="rating-label">
      Rate this dish:
    </span>

    <div
      class="stars"
      :aria-label="`Rate ${item.name}`"
    >
      <button
        v-for="star in 5"
        :key="star"
        type="button"
        class="star"
        :class="{ selected: star <= rating }"
        :aria-label="`${star} star${star === 1 ? '' : 's'}`"
        @click="rateDish(star)"
      >
        ★
      </button>
    </div>

    <span
      v-if="rating"
      class="rating-value"
    >
      {{ rating }}/5
    </span>
  </div>
</template>

<style scoped>
.dish-rating {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0;
}

.rating-label {
  font-size: 14px;
  font-weight: 600;
}

.stars {
  display: flex;
  gap: 3px;
}

.star {
  padding: 0;
  border: none;
  background: transparent;
  color: #d1d5db;
  font-size: 25px;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.15s ease,
    transform 0.15s ease;
}

.star.selected {
  color: #f59e0b;
}

.star:hover {
  transform: scale(1.15);
}

.star:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
  border-radius: 2px;
}

.rating-value {
  font-size: 13px;
  color: #6b7280;
}
</style>