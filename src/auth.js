import { ApiError, request } from './api.js'

export { ApiError }

const STORAGE_KEY = 'bu-auth-session'

/** Auth endpoints live under /api/auth. */
export function api(path, options) {
  return request(`/api/auth${path}`, options)
}

export function readSession() {
  const value = localStorage.getItem(STORAGE_KEY)
  if (!value) return null
  let session
  try {
    session = JSON.parse(value)
  } catch {
    clearSession()
    return null
  }
  if (!session || !/^[a-f0-9]{64}$/.test(session.token) || !Number.isFinite(session.expiresAt)) {
    clearSession()
    return null
  }
  // Always let /me validate expiry using the server's clock.
  return session
}

export function saveSession({ token, expiresAt }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }))
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}
