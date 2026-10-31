import { describe, expect, it } from 'vitest'
import { lootTendency } from '../../src/core/data/loot.ts'
import { slots, type SlotId } from '../../src/core/data/items.ts'
import { deployedJobs, partyOrder } from '../../src/core/data/jobs.ts'
import { partyLuk, rollItem } from '../../src/core/progress/items.ts'
import { dropItem, newProfile } from '../../src/core/progress/profile.ts'

describe('area loot tendencies', () => {
  it.each([[1, 'armor'], [5, 'armor'], [6, 'weapon'], [10, 'weapon'], [11, 'charm'], [15, 'charm'], [16, 'armor']] as const)(
    'uses the actual B%i area and favors %s', (floor, favoredSlot) => {
      const tendency = lootTendency(floor)
      expect(tendency.favoredSlot).toBe(favoredSlot)
      for (const slot of Object.keys(slots) as SlotId[]) {
        expect(tendency.weights[slot]).toBe(slots[slot].weight * (slot === favoredSlot ? 2 : 1))
      }
    })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid explicit floor %s', floor => {
    expect(() => rollItem({ rng: 7 }, 'bad', { floor, ilvl: 1, luk: 0, jobs: partyOrder })).toThrow('Invalid loot floor')
  })

  it.each([1, 6, 11])('rolls every slot at B%i with the advertised weighted distribution', floor => {
    const state = { rng: 7321 }, counts = { weapon: 0, armor: 0, charm: 0 }, count = 12000
    for (let index = 0; index < count; index++) {
      const item = rollItem(state, `i${index}`, { floor, ilvl: 30, luk: 0, jobs: partyOrder, minRarity: 0, maxRarity: 0 })
      counts[item.slot]++
    }
    const { weights } = lootTendency(floor), total = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
    for (const slot of Object.keys(slots) as SlotId[]) {
      expect(counts[slot]).toBeGreaterThan(0)
      expect(Math.abs(counts[slot] / count - weights[slot] / total)).toBeLessThan(.02)
    }
  })

  it('retains rarity draws, explicit slots, and mythic unique rolls', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const options = { ilvl: 60, luk: 100, jobs: partyOrder }
      const plain = rollItem({ rng: seed }, 'x', options)
      for (const floor of [1, 6, 11]) {
        expect(rollItem({ rng: seed }, 'x', { ...options, floor }).rarity).toBe(plain.rarity)
        for (const slot of Object.keys(slots) as SlotId[]) {
          const specified = { ...options, slot, minRarity: 1 as const, maxRarity: 1 as const }
          expect(rollItem({ rng: seed }, 'x', { ...specified, floor })).toEqual(rollItem({ rng: seed }, 'x', specified))
        }
        const mythic = { ...options, minRarity: 5 as const, maxRarity: 5 as const }
        expect(rollItem({ rng: seed }, 'x', { ...mythic, floor })).toEqual(rollItem({ rng: seed }, 'x', mythic))
      }
    }
  })

  it('passes the expedition floor independently of difficulty-adjusted equipment rank', () => {
    for (const difficulty of [0, 1, 2] as const) {
      const profile = newProfile('2026-11-01T00:00:00Z', 123)
      profile.options.autoEquip = false
      profile.progress.currentStage = 11
      profile.progress.depthRank = difficulty
      const activeJobs = deployedJobs(profile.party.order)
      const expected = rollItem({ rng: profile.rng }, 'i1', {
        floor: 1, ilvl: 1 + difficulty * 100, luk: partyLuk(profile, activeJobs), jobs: partyOrder,
        activeJobs, minRarity: 0, maxRarity: 0,
      })
      dropItem(profile, 1, 0, [], { min: 0, max: 0, difficulty })
      expect(profile.inventory[0]).toEqual(expected)
    }
  })
})
