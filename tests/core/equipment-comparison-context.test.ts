import { expect, it } from 'vitest'
import { buildView, newProfile, partyOrder, validateProfile } from '../../src/core/index.ts'
import { compareEquipment, createEquipmentComparison, equipCheck, equipItem, rollItem, statsOf } from '../../src/core/progress/items.ts'

function fixture() {
  const raw = newProfile('comparison', 42)
  for (const member of Object.values(raw.party.members)) member.lv = 60
  const profile = validateProfile(raw)
  for (let i = 0; i < 100; i++) profile.inventory.push(rollItem(profile, `i${profile.nextItemId++}`, {
    ilvl: 1200, luk: 100, jobs: partyOrder, slot: i % 2 ? undefined : 'charm', minRarity: 3, maxRarity: 4,
  }))
  return profile
}

it('scoped comparisons and eligibility equal independent calculations for all 1700 pairs', () => {
  const profile = fixture(), scoped = createEquipmentComparison(profile)
  for (const item of profile.inventory) for (const { job, check, comparison } of scoped(item)) {
    expect(check).toEqual(equipCheck(profile, job, item))
    expect(comparison).toEqual(compareEquipment(profile, job, item))
  }
})

it('the predicted result equals an actual equip; subsequent views reflect equipment and allocation edits', () => {
  const profile = fixture(), item = profile.inventory[0]
  const prediction = compareEquipment(profile, 'samurai', item)!
  expect(prediction).not.toBeNull()
  const initial = buildView(profile, false)
  expect(equipItem(profile, 'samurai', item.slot, item.id).ok).toBe(true)
  expect(statsOf(profile, 'samurai')).toEqual(prediction.after)
  const equipped = buildView(profile, false)
  expect(equipped.party.find((m) => m.job === 'samurai')!.equip.charm!.id).toBe(item.id)
  expect(equipped.inventory.some((i) => i.id === item.id)).toBe(false)
  const member = profile.party.members.samurai
  member.allocated.str--; member.allocated.vit++
  const changed = buildView(profile, false)
  expect(changed.party.find((m) => m.job === 'samurai')!.stats).not.toEqual(equipped.party.find((m) => m.job === 'samurai')!.stats)
  expect(initial.inventory.some((i) => i.id === item.id)).toBe(true)
  for (const viewItem of changed.inventory) {
    const real = profile.inventory.find((i) => i.id === viewItem.id)!
    const expected = compareEquipment(profile, 'samurai', real)
    if (expected) for (const [key, values] of Object.entries(viewItem.comparison.samurai!)) {
      expect(values!.before).toBe(expected.before[key as keyof typeof expected.before])
      expect(values!.after).toBe(expected.after[key as keyof typeof expected.after])
    }
  }
})
