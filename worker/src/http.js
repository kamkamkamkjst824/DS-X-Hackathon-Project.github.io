export const MAX_BODY_BYTES = 4096

export class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

/**
 * Reads a JSON request body with a hard size cap.
 * The streamed body is bounded too, because Content-Length may be absent or untrusted.
 */
export async function readJson(request, {
  maxBytes = MAX_BODY_BYTES,
  typeMessage = 'Please submit the request as JSON.',
  emptyMessage = 'Please submit a JSON request body.',
} = {}) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(400, typeMessage)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, emptyMessage)
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new HttpError(400, 'The request is too large.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new HttpError(400, 'Invalid request format.')
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Rejects payloads containing keys outside the allowed set. */
export function assertKnownKeys(body, allowed) {
  const unknown = Object.keys(body).filter(key => !allowed.includes(key))
  if (unknown.length) throw new HttpError(400, `Unknown field: ${unknown[0].slice(0, 40)}.`)
}
