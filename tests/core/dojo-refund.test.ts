import { describe, expect, it } from 'vitest'
import { buildView, newProfile, validateProfile, runCommand, createGame } from '../../src/core/index.ts'
import { dojoCost, buyDojo } from '../../src/core/progress/profile.ts'
import { retiredDojoCost } from '../../src/core/progress/dojoRefund.ts'
import { parseCommand } from '../../src/shared/validate.ts'

function legacy() {
  const raw = JSON.parse(JSON.stringify(newProfile('2026-11-01T00:00:00Z')))
  delete raw.dojoRefund
  raw.dojo = { atk: 3, hp: 2, walk: 2, drop: 3, offline: 1 }
  raw.koban = 1000; raw.stats.totalKoban = 8000
  return raw
}
describe('retired dojo purchase refunds', () => {
  it('refunds exact historical purchase costs once while preserving other progress and raw input', () => {
    const raw = legacy(), original = structuredClone(raw)
    const restored = validateProfile(raw)
    expect(restored.koban).toBe(1725) // ATK 100+150+225, HP 100+150.
    expect(restored.dojo).toEqual({ atk: 0, hp: 0, walk: 2, drop: 3, offline: 1 })
    expect(restored.dojoRefund).toEqual({ revision: 2, atkLevels: 3, hpLevels: 2, totalAmount: '725', creditedAmount: '725', pendingAmount: '0' })
    for (const key of ['stats', 'rates', 'inventory', 'party', 'progress'] as const) expect(restored[key]).toEqual(raw[key])
    expect(raw).toEqual(original)
    expect(validateProfile(JSON.parse(JSON.stringify(restored)))).toEqual(restored)
    expect(buildView(restored, false).dojo.map(entry => entry.key)).toEqual(['walk', 'drop', 'offline'])
    expect(buildView(restored, false).dojoRefund).toEqual(restored.dojoRefund)
  })
  it('retains exact overflow refunds without modifying the legacy record or paying twice', () => {
    for (const levels of [0, 1, 9, 30, 60, 77, 100]) expect(retiredDojoCost(levels)).toBe(Array.from({ length: levels }, (_, level) => BigInt(dojoCost('atk', level))).reduce((sum, cost) => sum + cost, 0n))
    expect(retiredDojoCost(Number.MAX_SAFE_INTEGER)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER))
    const raw = legacy(); raw.koban = Number.MAX_SAFE_INTEGER
    const original = structuredClone(raw)
    const profile = validateProfile(raw)
    expect(profile.koban).toBe(Number.MAX_SAFE_INTEGER)
    expect(profile.dojoRefund.pendingAmount).toBe('725')
    const game = createGame(profile, 1)
    expect(runCommand(game, { c: 'claimDojoRefund' }).ok).toBe(false)
    expect(runCommand(game, { c: 'buyDojo', key: 'walk' }).ok).toBe(true)
    const spent = dojoCost('walk', 2)
    expect(runCommand(game, { c: 'claimDojoRefund' }).ok).toBe(true)
    expect(profile.dojoRefund.creditedAmount).toBe(String(spent))
    expect(profile.dojoRefund.pendingAmount).toBe(String(725 - spent))
    expect(profile.stats.totalKoban).toBe(8000)
    expect(validateProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile)
    expect(raw).toEqual(original)
    const huge = legacy(); huge.dojo.atk = Number.MAX_SAFE_INTEGER; huge.koban = 0
    const migrated = validateProfile(huge)
    expect(migrated.koban).toBe(Number.MAX_SAFE_INTEGER)
    expect(BigInt(migrated.dojoRefund.creditedAmount) + BigInt(migrated.dojoRefund.pendingAmount)).toBe(retiredDojoCost(huge.dojo.atk) + retiredDojoCost(huge.dojo.hp))
    expect(validateProfile(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated)
    migrated.koban -= 500
    const hugeGame = createGame(migrated, 1)
    expect(parseCommand({ c: 'claimDojoRefund' })).toEqual({ c: 'claimDojoRefund' })
    expect(runCommand(hugeGame, { c: 'claimDojoRefund' }).ok).toBe(true)
    expect(BigInt(migrated.dojoRefund.creditedAmount)).toBe(BigInt(Number.MAX_SAFE_INTEGER) + 500n)
    expect(validateProfile(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated)
    const fractional = legacy(); fractional.dojo.atk = 77; fractional.koban = 1000.25
    const kept = validateProfile(fractional), paid = Number(kept.dojoRefund.creditedAmount)
    expect(kept.koban - paid).toBe(1000.25)
    expect(BigInt(kept.dojoRefund.creditedAmount) + BigInt(kept.dojoRefund.pendingAmount)).toBe(BigInt(kept.dojoRefund.totalAmount))
  })
  it('migrates the old numeric refund record without another credit and rejects corrupt decimal balances', () => {
    const old = legacy(); old.dojo.atk = old.dojo.hp = 0
    old.dojoRefund = { revision: 1, atkLevels: 3, hpLevels: 2, amount: 725 }
    const migrated = validateProfile(old)
    expect(migrated.koban).toBe(old.koban)
    expect(migrated.dojoRefund.creditedAmount).toBe('725')
    for (const value of ['-1', '01', '1.5', '1e3', '9'.repeat(34), 725]) {
      expect(() => validateProfile({ ...migrated, dojoRefund: { ...migrated.dojoRefund, pendingAmount: value } })).toThrow('bad dojo refund')
    }
    expect(() => validateProfile({ ...migrated, dojoRefund: { ...migrated.dojoRefund, creditedAmount: '724' } })).toThrow('inconsistent amounts')
  })
  it('rejects invalid existing markers and retired levels rather than refunding twice', () => {
    for (const marker of [null, [], false, { revision: 2, atkLevels: 0, hpLevels: 0, amount: 0 }, { revision: 1, atkLevels: 1, hpLevels: 0, amount: 0 }]) {
      const raw = legacy(); raw.dojoRefund = marker
      expect(() => validateProfile(raw)).toThrow('bad dojo refund')
    }
    const completed = JSON.parse(JSON.stringify(validateProfile(legacy())))
    completed.dojo.atk = 1
    expect(() => validateProfile(completed)).toThrow('inconsistent completed migration')
    const malformed = legacy(); malformed.dojo.hp = -1
    expect(() => validateProfile(malformed)).toThrow('bad dojo.hp')
  })
  it('rejects retired purchases without spending, keeping all three convenience upgrades purchasable', () => {
    const profile = newProfile('test'); profile.koban = 100000
    const game = createGame(profile, 1)
    for (const key of ['atk', 'hp'] as const) {
      expect(buyDojo(profile, key).ok).toBe(false)
      expect(runCommand(game, { c: 'buyDojo', key }).ok).toBe(false)
    }
    expect(profile.koban).toBe(100000)
    for (const key of ['walk', 'drop', 'offline'] as const) expect(buyDojo(profile, key).ok).toBe(true)
    expect(validateProfile(JSON.parse(JSON.stringify(profile))).dojoRefund.totalAmount).toBe('0')
  })
})
