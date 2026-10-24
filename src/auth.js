const STORAGE_KEY = 'bu-auth-session'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://bu-auth-worker.tangyingkai120.workers.dev').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}/api/auth${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
  } catch {
    throw new Error('Unable to connect. Please check your connection and try again.')
  }
  let result
  try {
    result = await response.json()
  } catch {
    throw new ApiError('Unexpected server response. Please try again later.', response.status)
  }
  if (!response.ok) throw new ApiError(result.error || 'Something went wrong. Please try again.', response.status)
  return result
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
