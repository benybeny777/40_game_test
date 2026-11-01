import { expect, it } from 'vitest'
import { balance, computeStats, expToNext, jobs, newProfile, validateProfile, applyRewards, availablePoints } from '../../src/core/index.ts'
import { gearContribution } from '../../src/core/sim/gearContribution.ts'
import { rollItem } from '../../src/core/progress/items.ts'
import { depthScale } from '../../src/core/data/dungeon.ts'

it('keeps early EXP costs, extends growth to 100, and preserves existing level and allocation', () => {
  for (let lv = 1; lv < 10; lv++) expect(expToNext(lv)).toBe(Math.floor(20 * lv ** 1.6))
  for (let lv = 2; lv < balance.maxLevel; lv++) expect(expToNext(lv)).toBeGreaterThan(expToNext(lv - 1))
  expect(expToNext(90)).toBeGreaterThan(expToNext(60) * 5)
  const profile = newProfile('test'), member = profile.party.members.samurai
  member.lv = 60; member.exp = 123; member.autoStats = false; member.allocated.str = 177
  const restored = validateProfile(profile)
  expect(restored.party.members.samurai).toEqual(member)
  expect(availablePoints(restored.party.members.samurai)).toBe(0)
  member.lv = 99; member.exp = 0
  applyRewards(profile, [{ t: 'reward', exp: expToNext(99), koban: 0, enemyId: '', x: 0 }], ['samurai'])
  expect(member.lv).toBe(100); expect(member.exp).toBe(0)
  expect(availablePoints(member)).toBe(120)
})

it('neither max level, extreme allocation nor retired training replaces equipment', () => {
  const naked = computeStats(jobs.samurai, 100, {}, [], { str: 297, dex: 0, vit: 0, int: 0 })
  const veteran = computeStats(jobs.samurai, 10, {}, [], { str: 27, dex: 0, vit: 0, int: 0 })
  expect(naked.atk).toBeLessThan(veteran.atk * 1.2)
  expect(computeStats(jobs.samurai, 100, { atk: 1000, hp: 1000 }, [], { str: 297, dex: 0, vit: 0, int: 0 })).toEqual(naked)
  const vitality = computeStats(jobs.samurai, 100, {}, [], { str: 0, dex: 0, vit: 297, int: 0 })
  expect(vitality.maxHp).toBeLessThan(200)
})

it('revalues legacy rarity once without mutating rolled values and rejects unsupported versions', () => {
  const old = { atk: 17, hp: 0, def: 0, rarity: 4 as const }
  expect(gearContribution(old).atk).toBeCloseTo(135)
  expect(old.atk).toBe(17)
  expect(gearContribution({ ...old, atk: 45, rollVersion: 2 }).atk).toBeCloseTo(135)
  const profile = newProfile('test')
  const item = rollItem(profile, 'i1', { ilvl: 10, jobs: ['samurai'], slot: 'weapon', luk: 0 })
  profile.inventory.push(item)
  expect(validateProfile(profile).inventory[0]).toEqual(item)
  expect(() => validateProfile({ ...profile, inventory: [{ ...item, rollVersion: 3 }] })).toThrow('unsupported item roll version')
})

it('unbounded floor and item generation remain finite and loadable', () => {
  const profile = newProfile('test')
  for (const difficulty of [0, 1, 2] as const) for (const value of Object.values(depthScale(Number.MAX_SAFE_INTEGER, difficulty))) expect(Number.isFinite(value)).toBe(true)
  for (const slot of ['weapon', 'armor', 'charm'] as const) profile.inventory.push(rollItem(profile, `i${profile.nextItemId++}`,
    { ilvl: Number.MAX_SAFE_INTEGER, jobs: ['samurai'], slot, luk: 0, minRarity: 4, maxRarity: 4 }))
  expect(validateProfile(profile).inventory).toHaveLength(3)
})

it('legendary affixes retain build headroom instead of inheriting the base-stat jackpot multiplier', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const state = { rng: seed }
    const gear = (['weapon', 'armor', 'charm'] as const).map(slot => rollItem(state, slot,
      { ilvl: 100, jobs: ['samurai'], slot, luk: 0, minRarity: 4, maxRarity: 4 }))
    const sum = (key: string) => gear.flatMap(item => item.affixes).filter(affix => affix.k === key).reduce((n, affix) => n + affix.v, 0)
    expect(1 + sum('intervalPct')).toBeGreaterThan(0.65)
    expect(1 + sum('cooldownPct')).toBeGreaterThan(0.55)
    expect(1 + sum('dmgTakenPct')).toBeGreaterThan(0.65)
  }
})
