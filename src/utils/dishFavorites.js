
export const FAVORITES_EVENT = 'bu-dish-favorites-changed'

function key(email) {
  const normalized = String(email || '').trim().toLowerCase()
  return normalized ? `bu-dish-favorites:${normalized}` : null
}

export function dishKey(dish) {
  if (!dish || typeof dish !== 'object') return ''

  const location = String(
    dish.location ?? dish.location_id ?? dish.hall ?? ''
  ).trim().toLowerCase()

  const id = dish.id ?? dish.item_id ?? dish.itemId

  const name = String(
    dish.name ?? dish.item_name ?? ''
  ).trim().toLowerCase()

  if (!location || (id == null && !name)) return ''

  return JSON.stringify([
    location,
    id == null ? `name:${name}` : `id:${id}`
  ])
}

export function readFavorites(email) {
  const storageKey = key(email)
  if (!storageKey) return []

  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey) || '[]'
    )

    return Array.isArray(parsed)
      ? parsed.filter(
          item => item &&
          typeof item.key === 'string' &&
          item.key
        )
      : []
  } catch {
    return []
  }
}

export function isFavorite(email, dish) {
  const id = dishKey(dish)

  return !!id && readFavorites(email).some(
    item => item.key === id
  )
}

export function toggleFavorite(email, dish) {
  const storageKey = key(email)
  const id = dishKey(dish)

  if (!storageKey || !id) {
    throw new Error(
      'Please sign in and select a valid dish.'
    )
  }

  const favorites = readFavorites(email)

  const existing = favorites.findIndex(
    item => item.key === id
  )

  if (existing >= 0) {
    favorites.splice(existing, 1)
  } else {
    favorites.unshift({
      key: id,
      id: dish.id ?? dish.item_id ?? dish.itemId ?? null,
      name: String(
        dish.name ?? dish.item_name ?? 'Unnamed dish'
      ),
      location: String(
        dish.location ??
        dish.location_id ??
        dish.hall
      ),
      meal: String(dish.meal ?? '')
    })
  }

  localStorage.setItem(
    storageKey,
    JSON.stringify(favorites)
  )

  window.dispatchEvent(
    new CustomEvent(FAVORITES_EVENT, {
      detail: { email }
    })
  )

  return existing < 0
}
