import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

export const origin = 'http://localhost:5173'
const SRC = fileURLToPath(new URL('../src/', import.meta.url))

/** Starts the Worker in Miniflare with all D1 migrations applied. */
export async function startWorker({ bindings = {}, outboundService } = {}) {
  // List every source module explicitly (entry first) so relative imports resolve.
  const files = (await readdir(SRC)).filter(name => name.endsWith('.js')).sort((a, b) => (a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b)))
  const mf = new Miniflare(convertV4MiniflareOptions({
    modulesRoot: SRC,
    modules: files.map(name => ({ type: 'ESModule', path: join(SRC, name) })),
    compatibilityDate: '2026-10-24',
    d1Databases: ['DB'],
    bindings: { ALLOWED_ORIGINS: origin, ...bindings },
    ...(outboundService ? { outboundService } : {}),
  }))
  const db = await mf.getD1Database('DB')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) {
    const migration = await readFile(new URL(file, dir), 'utf8')
    await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)))
  }
  return { mf, db }
}

export function requester(mf) {
  return async (path, { method = 'POST', body, token, headers = {} } = {}) => mf.dispatchFetch(`http://localhost${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
