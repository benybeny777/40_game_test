import { describe, expect, it } from 'vitest'
import { buildView, createGame, newProfile, runCommand, validateProfile } from '../src/core/index.ts'
import { equipItem, type Item } from '../src/core/progress/items.ts'
import { parseCommand } from '../src/shared/validate.ts'
import { nextLootChoice } from '../src/renderer/panel/nextChoice.ts'

const weapon = (id: string, job: Item['job'], rarity: Item['rarity'], ilvl = 1): Item => ({
  id, job, rarity, ilvl, slot: 'weapon', name: id, isNew: true, locked: false, atk: 10, hp: 0, def: 0, affixes: [],
})

describe('one-at-a-time loot review', () => {
  it('prioritizes an immediately usable deployed upgrade over an unusable legendary', () => {
    const profile = newProfile('2026-11-01T00:00:00Z')
    profile.inventory.push(weapon('i1', 'sister', 4, 100), weapon('i2', 'samurai', 1))
    expect(nextLootChoice(buildView(profile, false))?.item.id).toBe('i2')
    const game = createGame(profile, 7), before = structuredClone(profile)
    expect(runCommand(game, { c: 'markItemSeen', itemId: 'i2' })).toEqual({ ok: true })
    before.inventory[1].isNew = false
    expect(profile).toEqual(before)
    expect(nextLootChoice(buildView(profile, false))?.item.id).toBe('i1')
    expect(runCommand(game, { c: 'markItemSeen', itemId: 'i1' })).toEqual({ ok: true })
    expect(nextLootChoice(buildView(profile, false))).toBeUndefined()
    expect(profile.inventory).toHaveLength(2)
    expect(equipItem(profile, 'samurai', 'weapon', 'i2').ok).toBe(true)
  })

  it('preserves a locked item, other new finds, and the seen state through save reload', () => {
    const profile = newProfile('2026-11-01T00:00:00Z')
    profile.inventory.push({ ...weapon('i1', 'sister', 4, 100), locked: true }, weapon('i2', 'samurai', 1))
    profile.nextItemId = 3
    const game = createGame(profile, 7)
    expect(runCommand(game, { c: 'markItemSeen', itemId: 'i1' }).ok).toBe(true)
    const restored = validateProfile(JSON.parse(JSON.stringify(profile)))
    expect(restored.inventory[0]).toMatchObject({ id: 'i1', locked: true, isNew: false })
    expect(restored.inventory[1].isNew).toBe(true)
    expect(runCommand(game, { c: 'markSeen' }).ok).toBe(true)
    expect(profile.inventory.every(item => !item.isNew)).toBe(true)
  })

  it('rejects stale missing or now-equipped targets without mutating any items', () => {
    const profile = newProfile('2026-11-01T00:00:00Z')
    profile.inventory.push(weapon('i1', 'samurai', 1))
    equipItem(profile, 'samurai', 'weapon', 'i1')
    const game = createGame(profile, 7), before = structuredClone(profile)
    expect(runCommand(game, { c: 'markItemSeen', itemId: 'i2' }).ok).toBe(false)
    expect(runCommand(game, { c: 'markItemSeen', itemId: 'i1' }).ok).toBe(false)
    expect(profile).toEqual(before)
  })

  it('parses a single item command and rejects malformed target ids', () => {
    expect(parseCommand({ c: 'markItemSeen', itemId: 'i12' })).toEqual({ c: 'markItemSeen', itemId: 'i12' })
    for (const itemId of [undefined, null, 12, '', ['i1'], 'i1/i2']) {
      expect(parseCommand({ c: 'markItemSeen', itemId })).toBeNull()
    }
    expect(parseCommand({ c: 'markSeen' })).toEqual({ c: 'markSeen' })
  })
})
