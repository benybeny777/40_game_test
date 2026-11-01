import { describe, expect, it } from 'vitest'
import { dropItem, newProfile, validateProfile } from '../../src/core/index.ts'
import { rollItem } from '../../src/core/progress/items.ts'
import { partyOrder } from '../../src/core/data/jobs.ts'
import type { Rarity } from '../../src/core/data/items.ts'

const saved = () => JSON.parse(JSON.stringify(newProfile(new Date().toISOString())))

// Actual v1 schema: 6bb6126:src/core/progress/profile.ts and data/jobs.ts.
// seenItems first appeared in v2 (970cff4), already as slot:job:name.
const historicalV1 = () => {
  const order = ['samurai', 'ninja', 'jirai', 'otaku', 'pachipro']
  return {
    version: 1, savedAt: '2026-10-20T00:00:00.000Z',
    progress: { unlockedStage: 1, currentStage: 1, loop: false },
    party: { order, members: Object.fromEntries(order.map(id => [id, { lv: 1, exp: 0 }])) },
    koban: 12, dojo: { atk: 0, hp: 0, walk: 0 },
    stats: { kills: 1, wipes: 0, bossKills: 0, stageClears: 0, playMs: 100, totalKoban: 12 },
    rates: { current: { koban: 12, exp: 1 }, minutes: [] }, seenEnemies: [], pendingOffline: null,
  }
}

describe('invalid optional save data is not silently discarded', () => {
  it('refuses duplicate or impossible negative affixes instead of producing zero/negative HP', () => {
    for (const affixes of [[{ k: 'hpPct', v: -1 }], [{ k: 'hpPct', v: -0.5 }], [{ k: 'defPct', v: -1 }],
      [{ k: 'atkPct', v: -0.5 }], [{ k: 'hpPct', v: 0.1 }, { k: 'hpPct', v: 0.2 }]]) {
      const raw = saved()
      const item = rollItem(raw, 'i1', { ilvl: 1, jobs: ['samurai'], luk: 0, slot: 'weapon', minRarity: 0, maxRarity: 0 })
      raw.inventory = [{ ...item, affixes }]; raw.nextItemId = 2
      raw.party.members.samurai.equip.weapon = 'i1'
      const original = structuredClone(raw)
      expect(() => validateProfile(raw)).toThrow('affix')
      expect(raw).toEqual(original)
    }
  })
  it('accepts actual generated effects for every job and rarity, including old marker-less tradeoffs', () => {
    const raw = saved()
    let id = 1
    const generatedUniques = new Set<string>()
    for (const job of partyOrder) for (let rarity = 0; rarity < 6; rarity++) for (let sample = 0; sample < 8; sample++) {
      const item = rollItem(raw, `i${id++}`, { ilvl: sample % 2 ? Number.MAX_SAFE_INTEGER : 40, jobs: [job], luk: 0, minRarity: rarity as Rarity, maxRarity: rarity as Rarity })
      if (item.uniqueId) generatedUniques.add(item.uniqueId)
      raw.inventory = [item]; raw.nextItemId = id
      expect(validateProfile(raw).inventory[0].affixes).toEqual(item.affixes)
      delete item.rollVersion
      expect(validateProfile(raw).inventory[0].affixes).toEqual(item.affixes)
    }
    expect([...generatedUniques].sort()).toEqual(['bastion', 'gale', 'oracle', 'titan'])
  })
  it('migrates the actual v1 schema, which predates discovered equipment', () => {
    const raw = historicalV1(), original = structuredClone(raw)
    const restored = validateProfile(raw)
    expect(restored.seenItems).toEqual([])
    expect(restored.koban).toBe(12)
    expect(restored.rates.legacyUnmeasuredGain).toEqual({ koban: 12, exp: 1 })
    expect(raw).toEqual(original)
  })
  it.each([null, ['historic-looking-name'], [5]])('does not disguise a malformed field injected into v1: %j', seenItems => {
    const raw = { ...historicalV1(), seenItems }, original = structuredClone(raw)
    expect(() => validateProfile(raw)).toThrow('seenItems')
    expect(raw).toEqual(original)
  })
  it.each([null, [], 'lost', false])('rejects malformed dungeonRecords: %j', invalid => {
    const raw = saved(); raw.dungeonRecords = invalid
    expect(() => validateProfile(raw)).toThrow('bad dungeonRecords')
    expect(raw.dungeonRecords).toEqual(invalid)
  })
  it.each(['object', 'currentStage', 'unlockedStage', 'depthRank', 'unlockedDepths', 'eventDepths', 'loop'])('validates every stored dungeon record field: %s', field => {
    const raw = saved()
    if (field === 'object') raw.dungeonRecords.yomi = null
    if (field === 'currentStage') raw.dungeonRecords.yomi.currentStage = 2
    if (field === 'unlockedStage') raw.dungeonRecords.yomi.unlockedStage = 2
    if (field === 'depthRank') raw.dungeonRecords.yomi.depthRank = 1
    if (field === 'unlockedDepths') raw.dungeonRecords.yomi.unlockedDepths = [1, 1, 0]
    if (field === 'eventDepths') raw.dungeonRecords.yomi.eventDepths = [2, 0, 0]
    if (field === 'loop') raw.dungeonRecords.yomi.loop = 'false'
    const original = structuredClone(raw)
    expect(() => validateProfile(raw)).toThrow('dungeonRecords.yomi')
    expect(raw).toEqual(original)
  })
  it('refuses unsupported future dungeon records without erasing their progress', () => {
    const raw = saved(); raw.dungeonRecords.future = { ...raw.progress }
    expect(() => validateProfile(raw)).toThrow('unsupported dungeon record future: a compatible game version is required')
    expect(raw.dungeonRecords.future).toEqual(raw.progress)
  })
  it.each(['seenEnemies', 'seenItems'] as const)('rejects malformed discovery collection %s and invalid elements', field => {
    for (const value of [null, {}, 'lost', [5], [''], [null]]) {
      const raw = saved(); raw[field] = value
      expect(() => validateProfile(raw)).toThrow(field)
      expect(raw[field]).toEqual(value)
    }
  })
  it.each(['unknown', 'toString'])('rejects unsupported discovered enemy %s', id => {
    const raw = saved(); raw.seenEnemies = [id]
    expect(() => validateProfile(raw)).toThrow('unsupported seenEnemies[0]')
  })
  it.each(['unknown::name', 'weapon::name', 'weapon:unknown:name', 'armor::', 'name', 'armor:'])('rejects malformed discovered item %s', entry => {
    const raw = saved(); raw.seenItems = [entry]
    expect(() => validateProfile(raw)).toThrow('bad seenItems[0]')
  })
  it('preserves historical names and derived enemy IDs while rejecting duplicates', () => {
    const raw = saved(); raw.seenEnemies = ['bugsei_child']; raw.seenItems = ['weapon:samurai:旧版の刀改弐', 'armor::旧名:追加説明']
    const restored = validateProfile(raw)
    expect(restored.seenEnemies).toEqual(raw.seenEnemies); expect(restored.seenItems).toEqual(raw.seenItems)
    raw.seenEnemies.push('bugsei_child')
    expect(() => validateProfile(raw)).toThrow('bad seenEnemies[1]')
    raw.seenEnemies.pop(); raw.seenItems.push(raw.seenItems[0])
    expect(() => validateProfile(raw)).toThrow('bad seenItems[2]')
  })
  it('migrates only missing historical discovery and dungeon fields', () => {
    const raw = saved(); delete raw.dungeonRecords; delete raw.seenEnemies; delete raw.seenItems
    delete raw.progress.depthRank; delete raw.progress.unlockedDepths; delete raw.progress.eventDepths
    const restored = validateProfile(raw)
    expect(restored.dungeonRecords.yomi).toEqual(restored.progress)
    expect(restored.seenEnemies).toEqual([]); expect(restored.seenItems).toEqual([])
    expect(restored.progress.unlockedDepths).toEqual([1, 0, 0])
  })
  it.each([null, [], 'lost', false])('rejects malformed options instead of replacing them: %j', invalid => {
    const raw = saved(); raw.options = invalid
    expect(() => validateProfile(raw)).toThrow('bad options')
    expect(raw.options).toEqual(invalid)
  })
  it.each([null, 'false', 0, 1, {}])('rejects non-boolean configuration: %j', invalid => {
    const mutations = [
      { field: 'options.autoEquip', set: (raw: ReturnType<typeof saved>) => { raw.options.autoEquip = invalid } },
      { field: 'member samurai.autoStats', set: (raw: ReturnType<typeof saved>) => { raw.party.members.samurai.autoStats = invalid } },
      { field: 'progress.loop', set: (raw: ReturnType<typeof saved>) => { raw.progress.loop = invalid } },
      { field: 'progress.inTown', set: (raw: ReturnType<typeof saved>) => { raw.progress.inTown = invalid } },
    ]
    for (const { field, set } of mutations) {
      const raw = saved(); set(raw); const original = structuredClone(raw)
      expect(() => validateProfile(raw)).toThrow(`bad ${field}`)
      expect(raw).toEqual(original)
    }
  })
  it.each([-1, 6, 1.5, '1', false, {}])('rejects invalid auto-sale rarity: %j', invalid => {
    const raw = saved(); raw.options.autoSellMaxRarity = invalid
    expect(() => validateProfile(raw)).toThrow('bad options.autoSellMaxRarity')
  })
  it.each(['locked', 'isNew'])('rejects invalid item %s flags', flag => {
    const raw = saved(), item = rollItem(raw, 'i1', { ilvl: 1, jobs: ['samurai'], luk: 0 })
    raw.inventory = [{ ...item, [flag]: 'false' }]
    expect(() => validateProfile(raw)).toThrow(`bad item i1.${flag}`)
  })
  it.each([null, -1, 0.5, '1', Infinity])('rejects invalid dojo levels: %j', invalid => {
    const raw = saved(); raw.dojo.walk = invalid
    expect(() => validateProfile(raw)).toThrow('bad dojo.walk')
  })
  it.each(['kills', 'wipes', 'bossKills', 'stageClears', 'playMs', 'drops'])('rejects fractional statistics.%s rather than accepting corrupted counters', field => {
    const raw = saved(); raw.stats[field] = 0.5
    expect(() => validateProfile(raw)).toThrow(`bad statistics.${field}`)
  })
  it.each([null, -1, '3', Infinity, NaN])('rejects malformed known statistic amounts: %j', invalid => {
    const raw = saved(); raw.stats.totalKoban = invalid
    expect(() => validateProfile(raw)).toThrow('bad statistics.totalKoban')
  })
  it('fills only omitted historical options and keeps valid false/null settings', () => {
    const raw = saved()
    raw.options = { autoEquip: false, autoSellMaxRarity: null }
    raw.party.members.samurai.autoStats = false; raw.progress.loop = true; raw.progress.inTown = true
    expect(validateProfile(raw).options).toEqual(raw.options)
    expect(validateProfile(raw).party.members.samurai.autoStats).toBe(false)
    delete raw.options; delete raw.party.members.samurai.autoStats; delete raw.progress.loop; delete raw.progress.inTown
    delete raw.dojo.walk; delete raw.stats.drops
    raw.stats.futureCounter = 12
    const restored = validateProfile(raw)
    expect(restored.options).toEqual({ autoEquip: true, autoSellMaxRarity: null })
    expect(restored.party.members.samurai.autoStats).toBe(true)
    expect(restored.progress.loop).toBe(false); expect(restored.progress.inTown).toBe(false)
    expect(restored.dojo.walk).toBe(0); expect(restored.stats.drops).toBe(0)
    expect(restored.stats).not.toHaveProperty('futureCounter')
  })
  it.each(['stats', 'options'])('rejects malformed v1 %s before migration can conceal it', field => {
    const raw = saved(); raw.version = 1; raw[field] = null
    expect(() => validateProfile(raw)).toThrow(field === 'stats' ? 'bad statistics' : 'bad options')
  })
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
