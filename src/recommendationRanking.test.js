import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLocationRanks, readPriorityOrder } from './recommendationRanking.js'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./api.js', () => ({ request }))

afterEach(() => localStorage.clear())

describe('recommendation settings helpers', () => {
  it('defaults to the existing priority order and reads valid saved order', () => {
    expect(readPriorityOrder()).toEqual({ nutrition: 1, food: 2, location: 3 })
    localStorage.setItem('recommendationPriorities', JSON.stringify({ order: { food: 1, location: 2, nutrition: 3 } }))
    expect(readPriorityOrder()).toEqual({ food: 1, location: 2, nutrition: 3 })
  })

  it('rejects duplicate saved priorities', () => {
    localStorage.setItem('recommendationPriorities', JSON.stringify({ order: { food: 1, location: 1, nutrition: 3 } }))
    expect(() => readPriorityOrder()).toThrow(/invalid/)
  })

  it('reads the account dining hall ranks', async () => {
    request.mockResolvedValue({ preferences: [{ location: 'warren', rank: 1 }, { location: 'west', rank: 3 }] })
    await expect(readLocationRanks('token')).resolves.toEqual({ warren: 1, west: 3 })
    expect(request).toHaveBeenCalledWith('/api/location-preferences', { token: 'token' })
  })
})
