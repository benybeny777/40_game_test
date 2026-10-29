import { describe, expect, it } from 'vitest'
import { advance, computeOffline, createGame, newProfile, perMinute, validateProfile } from '../../src/core/index.ts'
import { prepareCloudRestore } from '../../src/shared/cloudProfile.ts'

describe('real-time tempo accounting', () => {
  it('keeps the minute clock through ten half-minute save/restart and import cycles', () => {
    let profile = newProfile('2026-10-30T00:00:00Z', 7)
    for (let session = 0; session < 10; session++) {
      const game = createGame(profile, 7)
      for (let tick = 0; tick < 600; tick++) advance(game)
      const saved = JSON.parse(JSON.stringify(profile))
      profile = session % 2 ? prepareCloudRestore(saved, Date.parse(saved.savedAt)) : validateProfile(saved)
      expect(profile.rates.elapsedMs).toBe(session % 2 ? 0 : 30000)
      expect(profile.rates.minutes).toHaveLength(Math.floor((session + 1) / 2))
      expect(profile.rates).toEqual(game.profile.rates)
    }
    expect(profile.stats.playMs).toBe(300000)
    expect(profile.rates.minutes.reduce((sum, gain) => sum + gain.koban, 0)).toBe(profile.stats.totalKoban)
    expect(perMinute(profile).koban).toBe(profile.stats.totalKoban / 5)
  })
  it('preserves old unmeasured earnings explicitly without adding them to a newly timed minute', () => {
    const original = newProfile('2026-10-30T00:00:00Z', 7)
    original.koban = 500; original.party.members.samurai.exp = 10
    original.rates.current = { koban: 674, exp: 970 }
    original.rates.minutes = [{ koban: 10, exp: 20 }]
    const raw = JSON.parse(JSON.stringify(original)); delete raw.rates.elapsedMs; delete raw.rates.legacyUnmeasuredGain
    const profile = validateProfile(raw)
    expect(profile.koban).toBe(500); expect(profile.party).toEqual(original.party)
    expect(profile.rates).toEqual({ current: { koban: 0, exp: 0 }, minutes: original.rates.minutes,
      elapsedMs: 0, legacyUnmeasuredGain: { koban: 674, exp: 970 } })
    expect(raw.rates.current).toEqual(original.rates.current)
    const game = createGame(profile, 7)
    for (let tick = 0; tick < 1200; tick++) advance(game)
    expect(profile.rates.minutes[1].koban).toBe(profile.stats.totalKoban)
    const restored = prepareCloudRestore(JSON.parse(JSON.stringify(profile)), Date.parse(profile.savedAt))
    expect(restored.rates).toEqual(profile.rates)
    expect(restored.rates.legacyUnmeasuredGain).toEqual({ koban: 674, exp: 970 })
  })
  it.each([null, -1, 60000, Infinity, NaN, '30000'])('rejects present invalid elapsed time %s', invalid => {
    const raw = newProfile('2026-10-30T00:00:00Z', 7) as unknown as { rates: Record<string, unknown> }
    raw.rates.elapsedMs = invalid
    expect(() => validateProfile(raw)).toThrow('bad earnings elapsed time')
  })
  it.each([{}, { koban: -1, exp: 0 }, { koban: 0, exp: Infinity }, []])('rejects malformed historical unmeasured earnings', invalid => {
    const raw = newProfile('2026-10-30T00:00:00Z', 7) as unknown as { rates: Record<string, unknown> }
    raw.rates.legacyUnmeasuredGain = invalid
    expect(() => validateProfile(raw)).toThrow('bad legacy earnings')
  })
  it('rejects overflow rather than discarding or capping legacy earnings', () => {
    const raw = JSON.parse(JSON.stringify(newProfile('2026-10-30T00:00:00Z', 7)))
    delete raw.rates.elapsedMs
    raw.rates.legacyUnmeasuredGain = { koban: Number.MAX_SAFE_INTEGER, exp: 0 }
    raw.rates.current.koban = 1
    expect(() => validateProfile(raw)).toThrow('legacy earnings exceed supported range')
  })
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
