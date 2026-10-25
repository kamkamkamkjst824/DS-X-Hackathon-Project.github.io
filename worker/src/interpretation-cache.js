// D1 cache for LLM preference interpretations plus the resolve path used by recommend().
// Only successful AI interpretations are cached; a fallback is always retried next time.
import { INTERPRETATION_MODEL, fallbackInterpretation, interpretPreferences } from './interpret.js'

const TABLE = 'preference_interpretations'
const encoder = new TextEncoder()

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Cache key: changes whenever the saved likes text or the model changes. */
export async function interpretationKey(likes) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${INTERPRETATION_MODEL}\u0000${likes}`))
  return hex(new Uint8Array(digest))
}

/** Returns the cached interpretation for this exact likes text, or null. Never throws. */
export async function loadInterpretation(db, userId, key, log) {
  if (!db) return null
  try {
    const row = await db.prepare(`SELECT likes_hash, interpretation FROM ${TABLE} WHERE user_id = ?`)
      .bind(userId)
      .first()
    if (!row || row.likes_hash !== key) return null
    const parsed = JSON.parse(row.interpretation)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    log?.('interpretation cache read failed', error?.message)
    return null
  }
}

/** Upserts one row. Cache failures are logged, never propagated. */
export async function saveInterpretation(db, userId, key, value, log) {
  if (!db) return false
  try {
    await db.prepare(`INSERT INTO ${TABLE} (user_id, likes_hash, interpretation, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        likes_hash = excluded.likes_hash,
        interpretation = excluded.interpretation,
        updated_at = excluded.updated_at`)
      .bind(userId, key, JSON.stringify(value), Date.now())
      .run()
    return true
  } catch (error) {
    log?.('interpretation cache write failed', error?.message)
    return false
  }
}

/**
 * Resolves the student's food preferences into structured terms.
 * Always resolves: `source` is 'none' (no likes), 'ai', or 'fallback'.
 * Never rejects, so callers do not need a catch around it.
 */
export async function resolveInterpretation({ ai, db, userId, likes, log }) {
  const text = typeof likes === 'string' ? likes.trim() : ''
  if (!text) return { ...fallbackInterpretation(''), source: 'none' }

  const key = await interpretationKey(text)
  const cached = await loadInterpretation(db, userId, key, log)
  if (cached) return { ...cached, source: 'ai' }

  if (!ai) return { ...fallbackInterpretation(text), source: 'fallback' }

  try {
    const interpretation = await interpretPreferences(ai, { likes: text })
    if (!interpretation) {
      log?.('interpretation unusable')
      return { ...fallbackInterpretation(text), source: 'fallback' }
    }
    await saveInterpretation(db, userId, key, interpretation, log)
    return { ...interpretation, source: 'ai' }
  } catch (error) {
    log?.('interpretation failed', error?.message)
    return { ...fallbackInterpretation(text), source: 'fallback' }
  }
}
