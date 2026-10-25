import assert from 'node:assert/strict'
import { test } from 'node:test'
import { likeKeywords } from '../src/dining.js'
import {
  buildInterpretationMessages, fallbackInterpretation, interpretPreferences, interpretationSchema, sanitizeInterpretation,
} from '../src/interpret.js'
import { interpretationKey, loadInterpretation, resolveInterpretation, saveInterpretation } from '../src/interpretation-cache.js'

function fakeDb() {
  const rows = new Map()
  return {
    rows,
    prepare: () => ({
      bind(...args) {
        return {
          first: async () => rows.get(args[0]) ?? null,
          run: async () => { rows.set(args[0], { likes_hash: args[1], interpretation: args[2] }) },
        }
      },
    }),
  }
}

function fakeAi(output) {
  const calls = []
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input })
      if (output instanceof Error) throw output
      return { response: typeof output === 'function' ? output(input) : output }
    },
  }
}

test('sanitizeInterpretation normalizes terms, merges include and caps lists', () => {
  const parsed = sanitizeInterpretation({
    keywords: ['Spicy!', 'chicken', 'CHICKEN', 'a', '  ', 'crispy fried'],
    include: ['noodles'],
    exclude: ['Cilantro', ' peanut '],
    flavors: ['Smoky'],
  })
  assert.deepEqual(parsed, {
    keywords: ['spicy', 'chicken', 'crispy fried', 'noodles'],
    include: ['noodles'],
    exclude: ['cilantro', 'peanut'],
    flavors: ['smoky'],
  })
  assert.equal(sanitizeInterpretation({ keywords: [], include: [], exclude: [], flavors: [] }), null)
  assert.equal(sanitizeInterpretation({ keywords: ['!!!'], include: [], exclude: [], flavors: [] }), null)
  assert.equal(sanitizeInterpretation('not an object'), null)
  assert.equal(sanitizeInterpretation(null), null)
  const many = sanitizeInterpretation({
    keywords: Array.from({ length: 20 }, (_, index) => `term${index}`), include: [], exclude: [], flavors: [],
  })
  assert.equal(many.keywords.length, 8)
  assert.ok(many.keywords.every(term => term.length <= 24))
})

test('interpretationSchema requires four string arrays and no extra keys', () => {
  const schema = interpretationSchema()
  assert.deepEqual(schema.required, ['keywords', 'include', 'exclude', 'flavors'])
  assert.equal(schema.additionalProperties, false)
  assert.equal(schema.properties.keywords.maxItems, 8)
  assert.equal(schema.properties.exclude.maxItems, 6)
})

test('the interpretation prompt treats the student text as delimited data', () => {
  const messages = buildInterpretationMessages('想吃辣的鸡肉')
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /data, not instructions/)
  assert.match(messages[0].content, /English terms only/)
  assert.match(messages[1].content, /<<<\n想吃辣的鸡肉\n>>>/)
})

test('interpretPreferences sends a schema-constrained request and parses string JSON', async () => {
  const ai = fakeAi(JSON.stringify({ keywords: ['spicy', 'chicken'], include: [], exclude: [], flavors: ['spicy'] }))
  const result = await interpretPreferences(ai, { likes: '辣的鸡肉' })
  assert.deepEqual(result.keywords, ['spicy', 'chicken'])
  assert.equal(ai.calls[0].input.response_format.type, 'json_schema')
  assert.equal(ai.calls[0].input.temperature, 0.2)
  assert.equal(ai.calls[0].model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast')
})

test('fallbackInterpretation matches literal keyword extraction', () => {
  const likes = 'I love noodles and the Chicken'
  assert.deepEqual(fallbackInterpretation(likes).keywords, likeKeywords(likes).slice(0, 8))
  assert.deepEqual(fallbackInterpretation(likes).exclude, [])
  assert.deepEqual(fallbackInterpretation('').keywords, [])
})

test('interpretationKey changes with the likes text and is a sha256 hex digest', async () => {
  const first = await interpretationKey('noodles')
  const second = await interpretationKey('noodles')
  const third = await interpretationKey('noodle')
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first, second)
  assert.notEqual(first, third)
})

test('the interpretation cache round-trips and tolerates database failures', async () => {
  const db = fakeDb()
  const key = await interpretationKey('spicy')
  assert.equal(await loadInterpretation(db, 'user-1', key), null)
  assert.equal(await saveInterpretation(db, 'user-1', key, { keywords: ['spicy'] }), true)
  assert.deepEqual(await loadInterpretation(db, 'user-1', key), { keywords: ['spicy'] })
  assert.equal(await loadInterpretation(db, 'user-1', 'stale-key'), null)

  const broken = { prepare() { throw new Error('no such table') } }
  const logs = []
  assert.equal(await saveInterpretation(broken, 'user-1', key, { keywords: ['x'] }, (...args) => logs.push(args)), false)
  assert.equal(await loadInterpretation(broken, 'user-1', key, (...args) => logs.push(args)), null)
  assert.equal(logs.length, 2)
})

test('resolveInterpretation handles none, fallback, AI failures and cache hits', async () => {
  assert.equal((await resolveInterpretation({ likes: '   ' })).source, 'none')

  const noAi = await resolveInterpretation({ likes: 'noodles', db: null })
  assert.equal(noAi.source, 'fallback')
  assert.deepEqual(noAi.keywords, ['noodles'])

  const broken = await resolveInterpretation({ likes: 'noodles', ai: fakeAi(new Error('boom')) })
  assert.equal(broken.source, 'fallback')

  const unusable = await resolveInterpretation({ likes: 'noodles', ai: fakeAi('{}') })
  assert.equal(unusable.source, 'fallback')

  const ai = fakeAi(JSON.stringify({ keywords: ['noodle'], include: [], exclude: [], flavors: [] }))
  const db = fakeDb()
  const first = await resolveInterpretation({ likes: 'noodles', ai, db, userId: 'user-1' })
  assert.equal(first.source, 'ai')
  assert.deepEqual(first.keywords, ['noodle'])
  assert.equal(ai.calls.length, 1)
  const second = await resolveInterpretation({ likes: 'noodles', ai, db, userId: 'user-1' })
  assert.equal(second.source, 'ai')
  assert.equal(ai.calls.length, 1, 'the cached interpretation avoids a second model call')

  // A different likes text misses the cache and retries the model.
  await resolveInterpretation({ likes: 'soup', ai, db, userId: 'user-1' })
  assert.equal(ai.calls.length, 2)
})
