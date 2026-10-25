<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  rank: { type: Number, required: true },
})

const TAG_LABELS = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  gluten_free: 'Gluten-free',
  halal: 'Halal',
  cool_food: 'Cool Food',
}

const tags = computed(() => {
  const active = Object.entries(TAG_LABELS).filter(
    ([key]) => props.item.tags?.[key]
  )

  // Vegan already implies vegetarian.
  return active
    .filter(
      ([key]) =>
        !(key === 'vegetarian' && props.item.tags?.vegan)
    )
    .map(([, label]) => label)
})

const nutrition = computed(() => {
  const n = props.item.nutrition || {}

  return [
    ['Calories', n.calories, 'kcal'],
    ['Protein', n.protein_grams, 'g'],
    ['Carbs', n.carbs_grams, 'g'],
    ['Sat. fat', n.saturated_fat_grams, 'g'],
  ].filter(
    ([, value]) => value !== null && value !== undefined
  )
})


// ==========================================
// DISH RATING
// ==========================================

const rating = ref(loadRating())

function loadRating() {
  try {
    const ratings = JSON.parse(
      localStorage.getItem('dishRatings') || '{}'
    )

    return ratings[props.item.item_id]?.rating || 0
  } catch {
    return 0
  }
}

function rateDish(stars) {
  rating.value = stars

  try {
    const ratings = JSON.parse(
      localStorage.getItem('dishRatings') || '{}'
    )

    ratings[props.item.item_id] = {
      item_id: props.item.item_id,
      name: props.item.name,
      rating: stars,

      location: props.item.location?.id,
      location_name: props.item.location?.name,

      meal: props.item.meal,
      station: props.item.station,

      nutrition: props.item.nutrition,
      tags: props.item.tags,

      timestamp: new Date().toISOString(),
    }

    localStorage.setItem(
      'dishRatings',
      JSON.stringify(ratings)
    )
  } catch {
    // If localStorage fails, the selected stars
    // will still appear until the page is refreshed.
  }
}
</script>


<template>
  <li class="rec-card">

    <!-- Dish heading -->
    <div class="rec-head">
      <span class="rec-rank" aria-hidden="true">
        {{ rank }}
      </span>

      <div>
        <h4>{{ item.name }}</h4>

        <p class="rec-where">
          {{ item.location.name }}
          · {{ item.meal }}
          · {{ item.station }}
        </p>
      </div>
    </div>


    <!-- Recommendation explanation -->
    <p class="rec-reason">
      {{ item.reason }}
    </p>


    <!-- Dish description -->
    <p
      v-if="item.description"
      class="rec-description"
    >
      {{ item.description }}
    </p>


    <!-- ======================================
         DISH RATING
         ====================================== -->

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


    <!-- Nutrition -->
    <dl
      v-if="nutrition.length"
      class="rec-nutrition"
    >
      <div
        v-for="[label, value, unit] in nutrition"
        :key="label"
      >
        <dt>{{ label }}</dt>
        <dd>{{ value }} {{ unit }}</dd>
      </div>
    </dl>


    <!-- Dietary tags -->
    <ul
      v-if="tags.length"
      class="rec-tags"
      aria-label="Dietary labels"
    >
      <li
        v-for="tag in tags"
        :key="tag"
      >
        {{ tag }}
      </li>
    </ul>


    <!-- Ingredient information -->
    <details class="rec-details">

      <summary>
        Ingredients and allergy info
      </summary>

      <p v-if="item.ingredients">
        <strong>Ingredients:</strong>
        {{ item.ingredients }}
      </p>

      <p v-else>
        Ingredient details are not available for this dish.
      </p>

      <p class="rec-allergy">
        {{ item.allergy_notice }}
      </p>

      <p v-if="item.source_url">
        <a
          :href="item.source_url"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on BU Dining
          <span class="visually-hidden">
            (opens in a new tab)
          </span>
        </a>
      </p>

    </details>

  </li>
</template>


<style scoped>

/* ==========================================
   DISH RATING
   ========================================== */

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