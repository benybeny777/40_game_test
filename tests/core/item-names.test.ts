import { describe, expect, it } from 'vitest'
import { armorClassNames, charmNames, weaponNames, uniqueDefs } from '../../src/core/data/items.ts'
import { equipmentNameRanks, equipmentMarkStart, equipmentMarkSpan, type ArmorClass } from '../../src/core/data/itemNames.ts'
import { partyOrder } from '../../src/core/data/jobs.ts'
import { itemName, rollItem } from '../../src/core/progress/items.ts'
import { newProfile, validateProfile } from '../../src/core/progress/profile.ts'
import { translateGameText } from '../../src/shared/locales/en-game.ts'

describe('equipment names across the two finite difficulties', () => {
  it('has eight distinct named tiers per family before Abyss marks begin', () => {
    for (const names of [...Object.values(weaponNames), ...Object.values(armorClassNames), charmNames]) {
      expect(names).toHaveLength(equipmentNameRanks.length)
      expect(new Set(names).size).toBe(names.length)
      for (const name of names) expect(translateGameText(name), name).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
    }
    for (const job of partyOrder) {
      expect(equipmentNameRanks.map(rank => itemName('weapon', job, rank))).toEqual(weaponNames[job])
      for (let rank = 1; rank <= 200; rank++) expect(itemName('weapon', job, rank)).not.toContain('・改')
      expect(itemName('weapon', job, equipmentMarkStart)).toBe(`${weaponNames[job].at(-1)}・改弐`)
      expect(itemName('weapon', job, equipmentMarkStart + equipmentMarkSpan)).toBe(`${weaponNames[job].at(-1)}・改参`)
    }
  })

  it('names actual rolled robes, light garments and heavy armor by their equipment class', () => {
    const seen = new Set<string>(), state = { rng: 534 }
    for (let index = 0; index < 180; index++) {
      const rank = equipmentNameRanks[index % equipmentNameRanks.length]
      const item = rollItem(state, `i${index}`, { ilvl: rank, luk: 0, jobs: partyOrder, slot: 'armor', minRarity: 1, maxRarity: 1 })
      const kind = item.equipmentClass as ArmorClass
      seen.add(kind)
      expect(item.name).toBe(armorClassNames[kind][index % equipmentNameRanks.length])
      if (kind === 'robe') expect(item.name).toMatch(/法衣|祭服/)
    }
    expect([...seen].sort()).toEqual(['heavy', 'light', 'robe'])
  })

  it('preserves unique names and existing save names, including legacy robe misnomers and marks', () => {
    const profile = newProfile('2026-11-01T00:00:00Z', 37)
    const legacy = rollItem(profile, 'i1', { ilvl: 30, luk: 0, jobs: partyOrder, slot: 'armor', minRarity: 1, maxRarity: 1 })
    legacy.equipmentClass = 'robe'; legacy.name = '鎖帷子・改弐'
    profile.inventory.push(legacy); profile.nextItemId = 2
    const saved = JSON.parse(JSON.stringify(profile))
    expect(validateProfile(saved).inventory[0]).toEqual(legacy)
    expect(translateGameText(legacy.name)).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
    const state = { rng: 37 }
    for (let index = 0; index < 100; index++) {
      const unique = rollItem(state, 'u', { ilvl: 200, luk: 0, jobs: partyOrder, minRarity: 5, maxRarity: 5 })
      expect(unique.name).toBe(uniqueDefs[unique.uniqueId!].name)
    }
  })
})
