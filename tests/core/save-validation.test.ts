import { describe, expect, it } from 'vitest'
import { dropItem, newProfile, validateProfile } from '../../src/core/index.ts'
import { rollItem } from '../../src/core/progress/items.ts'

const saved = () => JSON.parse(JSON.stringify(newProfile(new Date().toISOString())))

describe('invalid optional save data is not silently discarded', () => {
  it.each([0.5, -1, 4294967296])('rejects RNG values the world constructor cannot accept: %j', rng => {
    expect(() => validateProfile({ ...saved(), rng })).toThrow('bad rng')
  })
  it.each(['i' + '9'.repeat(310), `i${Number.MAX_SAFE_INTEGER}`, `i${Number.MAX_SAFE_INTEGER - 1}`])('rejects an item id whose successor cannot be used safely: %s', id => {
    const raw = saved()
    raw.inventory = [rollItem(raw, id, { ilvl: 1, jobs: ['samurai'], luk: 0 })]
    expect(() => validateProfile(raw)).toThrow('bad item id sequence')
  })
  it('repairs a stale valid item counter and remains valid through JSON save and reload', () => {
    const raw = saved()
    raw.inventory = [rollItem(raw, 'i4000', { ilvl: 1, jobs: ['samurai'], luk: 0 })]
    const restored = validateProfile(raw)
    expect(restored.nextItemId).toBe(4001)
    expect(validateProfile(JSON.parse(JSON.stringify(restored))).nextItemId).toBe(4001)
  })
  it('stops an exhausted id sequence before mutating counters, RNG or inventory', () => {
    const profile = newProfile(new Date().toISOString())
    profile.nextItemId = Number.MAX_SAFE_INTEGER - 1
    const before = structuredClone(profile)
    expect(() => dropItem(profile, 1, 0, [])).toThrow('item id sequence exhausted')
    expect(profile).toEqual(before)
    expect(validateProfile(JSON.parse(JSON.stringify(profile))).nextItemId).toBe(profile.nextItemId)
  })
  it.each(['slot', 'job', 'affix', 'unique'])('rejects prototype properties masquerading as item %s definitions', field => {
    const raw = saved(), item = rollItem(raw, 'i1', { ilvl: 1, jobs: ['samurai'], luk: 0 })
    raw.inventory = [item]
    if (field === 'affix') item.affixes = [{ k: 'toString', v: 1 }] as unknown as typeof item.affixes
    else if (field === 'slot') item.slot = 'toString' as typeof item.slot
    else if (field === 'job') item.job = 'toString' as typeof item.job
    else item.uniqueId = 'toString'
    expect(() => validateProfile(raw)).toThrow()
  })
  it.each([[], 'lost', { ms: 1000, koban: -1, exp: 5 }, { ms: '1000', koban: 5, exp: 5 }])('rejects malformed pending rewards: %j', invalid => {
    const raw = saved(); raw.pendingOffline = invalid
    expect(() => validateProfile(raw)).toThrow('bad offline rewards')
    expect(raw.pendingOffline).toEqual(invalid)
  })
  it.each([null, [], 'lost', { minutes: false }])('rejects malformed earnings history: %j', invalid => {
    const raw = saved(); raw.rates = invalid
    expect(() => validateProfile(raw)).toThrow('bad earnings')
  })
  it.each([null, [], 'lost'])('rejects malformed statistics: %j', invalid => {
    const raw = saved(); raw.stats = invalid
    expect(() => validateProfile(raw)).toThrow('bad statistics')
  })
  it.each([null, [], 'lost'])('rejects malformed attribute allocations: %j', invalid => {
    const raw = saved(); raw.party.members.samurai.allocated = invalid
    expect(() => validateProfile(raw)).toThrow('bad allocation')
  })
  it.each([null, -1, 1.5, '1', 4294967296])('rejects an invalid dungeon seed: %j', invalid => {
    const raw = saved(); raw.dungeonSeed = invalid
    expect(() => validateProfile(raw)).toThrow('bad dungeon seed')
  })
  it('keeps omitted historical fields compatible and accepts explicit absent rewards', () => {
    const raw = saved()
    delete raw.stats; delete raw.rates; delete raw.dungeonSeed; delete raw.party.members.samurai.allocated
    raw.pendingOffline = null
    const profile = validateProfile(raw)
    expect(profile.stats.kills).toBe(0); expect(profile.rates.minutes).toEqual([])
    expect(profile.dungeonSeed).toBe(1); expect(profile.pendingOffline).toBeNull()
    expect(profile.party.members.samurai.allocated).toEqual({ str: 0, dex: 0, vit: 0, int: 0 })
    delete raw.pendingOffline
    expect(validateProfile(raw).pendingOffline).toBeNull()
  })
})
