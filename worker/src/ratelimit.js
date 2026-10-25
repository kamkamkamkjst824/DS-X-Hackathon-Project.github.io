import { HttpError } from './http.js'

/**
 * Fixed-window per-user limiter backed by D1. The single upsert is atomic,
 * so concurrent requests cannot both slip under the limit.
 */
export async function enforceRateLimit(db, userId, { bucket, limit, windowMs, now = Date.now() }) {
  const windowStart = Math.floor(now / windowMs) * windowMs
  const row = await db.prepare(`
    INSERT INTO rate_limits (user_id, bucket, window_start, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, bucket) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
      window_start = excluded.window_start
    RETURNING count
  `).bind(userId, bucket, windowStart).first()
  if (row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))
    throw new HttpError(429, `You're requesting recommendations too quickly. Please try again in ${retryAfter} seconds.`,
      { 'Retry-After': String(retryAfter) })
  }
}
