export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://bu-auth-worker.tangyingkai120.workers.dev').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/** JSON request to the Worker. `path` is the full API path, e.g. "/api/preferences". */
export async function request(path, { method = 'GET', body, token, timeout = 15000 } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    })
  } catch (cause) {
    if (cause?.name === 'TimeoutError') throw new Error('The request took too long. Please try again.')
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
