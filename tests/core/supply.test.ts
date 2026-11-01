import { describe, expect, it } from 'vitest'
import { newProfile, partyOrder } from '../../src/core/index.ts'
import { equipItem, rollItem, type Item } from '../../src/core/progress/items.ts'
import { nextSupplyTarget, supplyArmorClass } from '../../src/core/progress/supply.ts'

describe('effective-strength expedition supply', () => {
  it('only selects deployed weapon/armor slots and resolves ties by canonical job then slot', () => {
    const profile = newProfile('supply')
    const active = ['otaku', 'ninja', 'samurai'] as const
    const first = partyOrder.find(job => active.includes(job as typeof active[number]))!
    expect(nextSupplyTarget(profile, active)).toEqual({ job: first, slot: 'weapon' })
    expect(nextSupplyTarget(profile, [])).toBeNull()
    expect(nextSupplyTarget(profile, ['sister'])).toEqual({ job: 'sister', slot: 'weapon' })
  })
  it('empty slots precede equipped items; selection never changes locks, engraving or gear', () => {
    const profile = newProfile('supply')
    const make = (id: string, slot: 'weapon' | 'armor', ilvl: number): Item => ({
      ...rollItem({ rng: 5 }, id, { ilvl, slot, jobs: ['samurai'], luk: 0 }), rarity: 4, locked: true,
      ...(slot === 'weapon' ? { engraving: 'focus' as const } : {}),
    })
    profile.inventory.push(make('w', 'weapon', 5), make('a', 'armor', 15))
    profile.party.members.samurai.equip.weapon = 'w'
    expect(nextSupplyTarget(profile, ['samurai'])).toEqual({ job: 'samurai', slot: 'armor' })
    profile.party.members.samurai.equip.armor = 'a'
    const before = structuredClone(profile)
    expect(nextSupplyTarget(profile, ['samurai'])).not.toBeNull()
    expect(profile).toEqual(before)
  })
  it('an old powerful legendary weapon does not monopolize supplies over weaker current armor', () => {
    const profile = newProfile('supply'); profile.progress.currentStage = 29
    const weapon = rollItem({ rng: 1 }, 'w', { ilvl: 9, jobs: ['samurai'], slot: 'weapon', luk: 0, minRarity: 4, maxRarity: 4 })
    const armor = rollItem({ rng: 2 }, 'a', { ilvl: 29, jobs: ['samurai'], slot: 'armor', armorClass: 'heavy', luk: 0, minRarity: 0, maxRarity: 0 })
    profile.inventory.push(weapon, armor); profile.party.members.samurai.equip.weapon = 'w'; profile.party.members.samurai.equip.armor = 'a'
    const before = structuredClone(profile)
    expect(nextSupplyTarget(profile, ['samurai'])).toEqual({ job: 'samurai', slot: 'armor' })
    expect(profile).toEqual(before)
    const strongerArmor = rollItem({ rng: 3 }, 'better-a', { ilvl: 29, jobs: ['samurai'], slot: 'armor', armorClass: 'heavy', luk: 0, minRarity: 4, maxRarity: 4 })
    profile.inventory.push(strongerArmor); profile.party.members.samurai.equip.armor = strongerArmor.id
    expect(nextSupplyTarget(profile, ['samurai'])).toEqual({ job: 'samurai', slot: 'weapon' })
  })
  it('normalizes job-specific attack and armor HP/DEF units instead of comparing their raw numbers', () => {
    const profile = newProfile('supply'); profile.progress.currentStage = 29
    for (const job of ['samurai', 'otaku'] as const) for (const slot of ['weapon', 'armor'] as const) {
      const item = rollItem({ rng: 1 }, `${job}-${slot}`, { ilvl: 29, jobs: [job], slot, armorClass: supplyArmorClass(job), luk: 0, minRarity: 0, maxRarity: 0 })
      // Controlled quality contrast; preserve real production slot ratios and job scaling.
      if (job === 'samurai' && slot === 'armor') { item.hp *= 0.5; item.def *= 0.5 }
      profile.inventory.push(item); profile.party.members[job].equip[slot] = item.id
    }
    expect(nextSupplyTarget(profile, ['otaku', 'samurai'])).toEqual({ job: 'samurai', slot: 'armor' })
  })
  it('does not disguise a broken equipped-item reference as an empty slot', () => {
    const profile = newProfile('supply'); profile.party.members.samurai.equip.weapon = 'missing'
    expect(() => nextSupplyTarget(profile, ['samurai'])).toThrow('Missing equipped supply item')
  })
  it.each(['samurai', 'ninja', 'otaku'] as const)('supplied %s armor matches its class while preserving requirements', job => {
    const profile = newProfile('supply')
    const item = rollItem(profile, 'a', { ilvl: 25, slot: 'armor', armorClass: supplyArmorClass(job), jobs: [job], luk: 0, minRarity: 0, maxRarity: 1 })
    expect(item.equipmentClass).toBe(supplyArmorClass(job))
    profile.inventory.push(item)
    expect(equipItem(profile, job, 'armor', item.id).ok).toBe(false)
  })
  it('armorClass does not alter weapon/charm rolls or override unique equipment', () => {
    for (const slot of ['weapon', 'charm'] as const) {
      const options = { ilvl: 15, slot, jobs: ['samurai'] as const, luk: 0 }
      expect(rollItem({ rng: 23 }, 'x', { ...options, armorClass: 'robe' })).toEqual(rollItem({ rng: 23 }, 'x', options))
    }
    for (let seed = 1; seed <= 20; seed++) {
      const options = { ilvl: 15, slot: 'armor' as const, jobs: ['samurai'] as const, luk: 0, minRarity: 5 as const, maxRarity: 5 as const }
      expect(rollItem({ rng: seed }, 'x', { ...options, armorClass: 'robe' })).toEqual(rollItem({ rng: seed }, 'x', options))
    }
  })
})
