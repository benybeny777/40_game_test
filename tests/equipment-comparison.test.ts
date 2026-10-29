import { describe, expect, it } from 'vitest'
import { buildView, newProfile } from '../src/core/index.ts'
import { statsOf, equipItem, type Item } from '../src/core/progress/items.ts'
import { equipmentChanges } from '../src/renderer/panel/equipmentComparison.ts'
import { nextLootChoice } from '../src/renderer/panel/nextChoice.ts'

describe('装備を選ぶための実能力比較', () => {
  it('控えが持つ装備を見つけて付け替えられ、二重所持にならない', () => {
    const profile = newProfile('test')
    const charm: Item = { id: 'reserve-charm', name: 'charm', slot: 'charm', ilvl: 1, rarity: 1,
      locked: false, isNew: false, atk: 0, hp: 10, def: 0, affixes: [] }
    profile.inventory.push(charm)
    expect(equipItem(profile, 'miko', 'charm', charm.id).ok).toBe(true)
    const before = buildView(profile, false)
    expect(before.inventory).toHaveLength(0)
    expect(before.reserveEquipment.map(item => item.id)).toEqual([charm.id])
    expect(equipItem(profile, 'samurai', 'charm', charm.id).ok).toBe(true)
    expect(profile.party.members.miko.equip.charm).toBeNull()
    expect(buildView(profile, false).reserveEquipment).toHaveLength(0)
  })
  it('今装備できない高希少品も確認導線に残す', () => {
    const profile = newProfile('test')
    const item: Item = { id: 'future', name: 'rare', slot: 'weapon', job: 'sister', ilvl: 100, rarity: 4,
      locked: false, isNew: true, atk: 10, hp: 0, def: 0, affixes: [] }
    profile.inventory.push(item)
    const choice = nextLootChoice(buildView(profile, false))
    expect(choice?.item.id).toBe('future')
    expect(choice?.member.job).toBe('sister')
    expect(choice?.item.equipable.sister.ok).toBe(false)
  })
  it('攻撃増と攻撃間隔悪化を両方示し、装着後の実能力と一致する', () => {
    const profile = newProfile('test')
    const item: Item = { id: 'test', name: 'tradeoff', slot: 'weapon', job: 'samurai', ilvl: 1, rarity: 3,
      locked: false, isNew: true, atk: 8, hp: 0, def: 0, affixes: [{ k: 'intervalPct', v: .2 }] }
    profile.inventory.push(item)
    const view = buildView(profile, false).inventory[0]
    const changes = equipmentChanges(view, 'samurai')
    expect(changes.find(change => change.key === 'atk')?.improved).toBe(true)
    expect(changes.find(change => change.key === 'intervalMs')?.improved).toBe(false)
    expect(equipItem(profile, 'samurai', 'weapon', item.id).ok).toBe(true)
    const equipped = statsOf(profile, 'samurai')
    expect(view.comparison.samurai?.atk?.after).toEqual(equipped.atk)
    expect(view.comparison.samurai?.intervalMs?.after).toEqual(equipped.intervalMs)
    expect(view.comparison.samurai?.maxHp).toBeUndefined()
    expect(view.comparison.ninja).toBeUndefined()
    expect(equipmentChanges(view, 'ninja')).toEqual([])
  })
})
