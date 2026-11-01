import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGame, newProfile, runCommand, computeStats, step, type JobId } from '../src/core/index.ts'
import { rollItem, type Item } from '../src/core/progress/items.ts'
import { spendAuto } from '../src/core/progress/attributes.ts'
import { attributeDefs } from '../src/core/data/attributes.ts'
import { balance } from '../src/core/data/balance.ts'
import { jobs } from '../src/core/data/jobs.ts'
import type { Rarity, SlotId } from '../src/core/data/items.ts'
import { REAL_TICK_MS } from '../src/core/data/timing.ts'

export interface BossGearOptions {
  seed: number; bossFloor: number; gearRank: number; rarity: Rarity; rollBand: 'low' | 'high'
  level?: number; dojoLevel?: number; timeoutSeconds?: number
  rareWeapon?: { rarity: 3 | 4; gearRank?: number }
}
function rolledFor(state: { rng: number }, id: string, job: JobId, slot: SlotId, options: BossGearOptions): Item {
  const armorClass = attributeDefs[job].main === 'str' ? 'heavy' : attributeDefs[job].main === 'int' ? 'robe' : 'light'
  for (let attempt = 0; attempt < 10000; attempt++) {
    const item = rollItem(state, id, { ilvl: options.gearRank, slot, jobs: [job], luk: 0,
      minRarity: options.rarity, maxRarity: options.rarity })
    if (slot === 'armor' && item.equipmentClass !== armorClass) continue
    if (item.baseRoll === undefined) throw new Error('Generated item has no base roll')
    if (options.rollBand === 'low' ? item.baseRoll <= 0.9 : item.baseRoll >= 1.1) return item
  }
  throw new Error(`No actual roll in requested band for ${job}/${slot}`)
}
/** Controlled wave-10 stress test, not natural progression. No forced damage, fabricated item stats or waived requirements. */
export function bossGearTrial(options: BossGearOptions) {
  const profile = newProfile('boss-gear-audit', options.seed), level = options.level ?? balance.maxLevel
  if (!Number.isInteger(level) || level < 1 || level > balance.maxLevel) throw new Error('Illegal level')
  if (!Number.isInteger(options.bossFloor) || options.bossFloor < 10 || options.bossFloor > 100 || options.bossFloor % 10 !== 0) throw new Error('Choose a boss floor: multiples of 10 through 100')
  const requestedDojo = options.dojoLevel ?? 0
  if (!Number.isSafeInteger(requestedDojo) || requestedDojo < 0) throw new Error('Illegal dojo level')
  profile.progress.currentStage = options.bossFloor; profile.progress.unlockedStage = options.bossFloor
  profile.progress.unlockedDepths[0] = options.bossFloor; profile.options.autoEquip = false
  const party = profile.party.order.slice(0, 3)
  for (const job of party) { profile.party.members[job].lv = level; spendAuto(profile.party.members[job], job) }
  const game = createGame(profile, options.seed), rollState = { rng: options.seed }
  for (const job of party) for (const slot of ['weapon', 'armor', 'charm'] as const) {
    const item = rolledFor(rollState, `i${profile.nextItemId++}`, job, slot, options)
    profile.inventory.push(item)
    const result = runCommand(game, { c: 'equip', job, slot, itemId: item.id })
    if (!result.ok) throw new Error(`Equipment rejected: ${job}/${slot}: ${result.reason}`)
  }
  if (options.rareWeapon) {
    // Generate all baseline slots first. The replacement never advances another slot's or the battle's RNG.
    const item = rolledFor({ rng: (options.seed ^ 0x53a9e81b) >>> 0 }, `i${profile.nextItemId++}`, 'samurai', 'weapon', {
      ...options, gearRank: options.rareWeapon.gearRank ?? options.gearRank, rarity: options.rareWeapon.rarity,
    })
    profile.inventory.push(item)
    const result = runCommand(game, { c: 'equip', job: 'samurai', slot: 'weapon', itemId: item.id })
    if (!result.ok) throw new Error(`Rare weapon rejected: ${result.reason}`)
  }
  const initial = party.map(job => {
    const member = profile.party.members[job], naked = computeStats(jobs[job], level, profile.dojo, [], member.allocated)
    const equipped = game.world.units.find(unit => unit.side === 'ally' && unit.defId === job)!.base
    const worn = Object.values(member.equip).filter(id => id !== null).map(id => {
      const item = profile.inventory.find(item => item.id === id)
      if (!item) throw new Error(`Equipped item missing: ${id}`)
      return item
    })
    const legacyDojoProbe = computeStats(jobs[job], level, { ...profile.dojo, atk: requestedDojo, hp: requestedDojo }, worn, member.allocated)
    if (JSON.stringify(legacyDojoProbe) !== JSON.stringify(equipped)) throw new Error('Retired dojo still changes combat stats')
    return { job, level, allocated: member.allocated, naked, equipped,
      legacyDojoIgnored: true,
      gearDifference: { atk: equipped.atk - naked.atk, hp: equipped.maxHp - naked.maxHp, def: equipped.def - naked.def },
      equipment: Object.fromEntries(Object.entries(member.equip).map(([slot, id]) => [slot, profile.inventory.find(item => item.id === id)])) }
  })
  // Full-health entry to wave 10. Prior nine waves, levelling and reward equipment are deliberately excluded.
  game.world.wave = balance.waves
  const limit = Math.ceil((options.timeoutSeconds ?? 180) * 1000 / REAL_TICK_MS)
  let outcome: 'win' | 'loss' | 'timeout' = 'timeout', elapsedTicks = 0, battleTicks = 0
  for (; elapsedTicks < limit; elapsedTicks++) {
    if (game.world.phase === 'battle') battleTicks++
    const events = step(game.world)
    if (events.some(event => event.t === 'phase' && event.phase === 'stageClear')) { outcome = 'win'; elapsedTicks++; break }
    if (events.some(event => event.t === 'phase' && event.phase === 'wipe')) { outcome = 'loss'; elapsedTicks++; break }
  }
  return { options: { ...options, level, dojoLevel: requestedDojo }, actualDojo: profile.dojo, initial, outcome,
    elapsedSeconds: elapsedTicks * REAL_TICK_MS / 1000, battleSeconds: battleTicks * REAL_TICK_MS / 1000,
    remaining: game.world.units.map(unit => ({ side: unit.side, id: unit.defId, hp: unit.hp, maxHp: unit.stats.maxHp, alive: unit.alive })) }
}

/** One actual rare weapon versus the exact same other eight items, allocations and initial battle RNG. */
export function rareWeaponComparison(options: Omit<BossGearOptions, 'rareWeapon'>, rareGearRank = options.gearRank) {
  const baseline = bossGearTrial(options)
  const comparisons = ([3, 4] as const).map(rarity => {
    const upgraded = bossGearTrial({ ...options, rareWeapon: { rarity, gearRank: rareGearRank } })
    for (let index = 0; index < baseline.initial.length; index++) {
      const before = baseline.initial[index], after = upgraded.initial[index]
      if (before.job !== after.job || JSON.stringify(before.allocated) !== JSON.stringify(after.allocated)) throw new Error('Party or allocation changed')
      for (const slot of ['weapon', 'armor', 'charm'] as const) {
        if (before.job === 'samurai' && slot === 'weapon') continue
        if (JSON.stringify(before.equipment[slot]) !== JSON.stringify(after.equipment[slot])) throw new Error('Unrelated equipment changed')
      }
    }
    return { rarity, upgraded, clearTimeSavedSeconds: baseline.outcome === 'win' && upgraded.outcome === 'win'
      ? baseline.elapsedSeconds - upgraded.elapsedSeconds : null }
  })
  return { conditions: 'Original baseline equipment RNG unchanged. All nine baseline items roll before a Samurai weapon replacement using an independent seed. Other eight equipped items and all allocations are asserted identical; battle starts with the same seed, but subsequent combat RNG consumption can diverge naturally. Actual rare affixes/engraving preserved; this measures the whole item, not rarity multiplier alone.', baseline, comparisons }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? '.dev-data/boss-gear-before.json')
  mkdirSync(resolve(output, '..'), { recursive: true })
  const results: ReturnType<typeof bossGearTrial>[] = []
  for (const bossFloor of [10, 20, 30]) for (const gearRank of [5, 15, 25]) for (const rarity of [0, 1] as const)
    for (const rollBand of ['low', 'high'] as const) for (const dojoLevel of [0, 1000]) for (const seed of [1, 2, 3]) {
      results.push(bossGearTrial({ bossFloor, gearRank, rarity, rollBand, dojoLevel, seed }))
    }
  writeFileSync(output, JSON.stringify({ maxLevel: balance.maxLevel,
    conditions: 'Controlled maximum-level default-party boss-wave tests. Legal auto allocation and equipment checks; actual generated gear rejection-sampled to 85-90% / 110-115% bands, no stat edits. Retired atk/hp dojo remains zero in profile; requested legacy values only probe computeStats for identical results. Normal difficulty; full HP entry; preceding waves, levelling, reward changes excluded; 180-second real-time-equivalent timeout. Stats difference includes interactions with attributes/affixes, not an independent additive damage percentage.', results }, null, 2))
  for (const bossFloor of [10, 20, 30]) for (const dojoLevel of [0, 1000]) {
    const cases = results.filter(result => result.options.bossFloor === bossFloor && result.options.dojoLevel === dojoLevel)
    console.log(JSON.stringify({ bossFloor, dojoLevel, cases: cases.length, wins: cases.filter(result => result.outcome === 'win').length,
      losses: cases.filter(result => result.outcome === 'loss').length, timeouts: cases.filter(result => result.outcome === 'timeout').length }))
  }
}
