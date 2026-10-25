
<script setup>
import { computed } from 'vue'
import FavoriteDishButton from './FavoriteDishButton.vue'

const props = defineProps({
  item: { type: Object, required: true },
  rank: { type: Number, required: true },
  email: { type: String, default: '' },
  canAddConsumed: { type: Boolean, default: false },
})
const emit = defineEmits(['consumed'])

const TAG_LABELS = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  gluten_free: 'Gluten-free',
  halal: 'Halal',
  cool_food: 'Cool Food'
}

const tags = computed(() => {
  const active = Object.entries(TAG_LABELS).filter(
    ([key]) => props.item.tags?.[key]
  )

  // Vegan already implies vegetarian.
  return active
    .filter(([key]) => !(
      key === 'vegetarian' && props.item.tags?.vegan
    ))
    .map(([, label]) => label)
})

const nutrition = computed(() => {
  const n = props.item.nutrition || {}

  return [
    ['Calories', n.calories, 'kcal'],
    ['Protein', n.protein_grams, 'g'],
    ['Carbs', n.carbs_grams, 'g'],
    ['Sat. fat', n.saturated_fat_grams, 'g'],
  ].filter(([, value]) => (
    value !== null && value !== undefined
  ))
})

// Convert the recommendation into the format expected
// by the FavoriteDishButton and favorites storage.
const favoriteDish = computed(() => ({
  id: props.item.id ?? props.item.item_id ?? null,
  name: props.item.name,
  location:
    props.item.location?.id ??
    props.item.location?.slug ??
    props.item.location?.name ??
    'Unknown location',
  meal: props.item.meal ?? '',
}))
</script>

<template>
  <li class="rec-card">
    <div class="rec-head">
      <span class="rec-rank" aria-hidden="true">
        {{ rank }}
      </span>

      <div>
        <h4>{{ item.name }}</h4>

        <p class="rec-where">
          {{ item.location.name }} ·
          {{ item.meal }} ·
          {{ item.station }}
        </p>

        <!-- NEW: Favorite / Unfavorite button -->
        <FavoriteDishButton
          v-if="email"
          :dish="favoriteDish"
          :email="email"
        />
      </div>
      <button
        v-if="canAddConsumed"
        class="rec-consumed"
        type="button"
        :aria-label="`Add ${item.name} as consumed food`"
        @click="emit('consumed', item)"
      >
        + Add as consumed
      </button>
    </div>
    <p class="rec-score"><strong>Preference score: {{ Number(item.score || 0).toFixed(1) }}/100</strong>
      <span v-if="item.score_breakdown"> · Nutrition {{ item.score_breakdown.nutrition ?? '—' }} · Food {{ item.score_breakdown.food ?? '—' }} · Location {{ item.score_breakdown.location }}</span>
    </p>
    <p class="rec-reason">{{ item.reason }}</p>
    <p v-if="item.description" class="rec-description">{{ item.description }}</p>
    <dl v-if="nutrition.length" class="rec-nutrition">
      <div v-for="[label, value, unit] in nutrition" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }} {{ unit }}</dd>
      </div>
    </dl>

    <ul
      v-if="tags.length"
      class="rec-tags"
      aria-label="Dietary labels"
    >
      <li v-for="tag in tags" :key="tag">
        {{ tag }}
      </li>
    </ul>

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
