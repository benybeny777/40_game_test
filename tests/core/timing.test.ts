import { describe, expect, it } from 'vitest'
import { advance, computeOffline, createGame, newProfile, validateProfile } from '../../src/core/index.ts'

describe('real-time tempo accounting', () => {
  it('preserves combat and RNG while completing the same progression in half the real time', () => {
    const current = createGame(newProfile('2026-10-30T00:00:00Z', 7), 7)
    const previous = createGame(structuredClone(current.profile), 7)
    for (let i = 0; i < 100; i++) { advance(current); advance(previous, 100) }
    expect(current.world).toEqual(previous.world)
    expect(current.profile.rng).toBe(previous.profile.rng)
    expect(current.profile.stats.playMs).toBe(5000)
    expect(previous.profile.stats.playMs).toBe(10000)
  })
  it('closes one actual minute after 1200 ticks and pays half that measured rate offline', () => {
    const game = createGame(newProfile('2026-10-30T00:00:00Z', 7), 7)
    for (let i = 0; i < 1199; i++) advance(game)
    expect(game.profile.rates.minutes).toHaveLength(0)
    advance(game)
    expect(game.world.tick).toBe(1200)
    expect(game.profile.stats.playMs).toBe(60000)
    expect(game.profile.rates.minutes).toHaveLength(1)
    const rate = game.profile.rates.minutes[0]
    expect(rate.koban).toBeGreaterThan(0)
    expect(computeOffline(game.profile, 600000)?.koban).toBe(Math.floor(rate.koban * 10 * 0.5))
  })
  it('carries fractional development milliseconds without saving fractional play time', () => {
    const game = createGame(newProfile('2026-10-30T00:00:00Z', 7), 7)
    for (let i = 0; i < 1560; i++) {
      advance(game, 100 / 2.6)
      expect(Number.isSafeInteger(game.profile.stats.playMs)).toBe(true)
    }
    expect(game.profile.stats.playMs).toBe(60000)
    expect(game.profile.rates.minutes).toHaveLength(1)
    expect(() => validateProfile(game.profile)).not.toThrow()
  })
})
