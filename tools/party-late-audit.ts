import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { advance, buildView, createGame, newProfile, partyOrder, runCommand, type JobId } from '../src/core/index.ts'
import { REAL_TICK_MS } from '../src/core/data/timing.ts'
import { auditParties } from './party-balance-audit.ts'
import { reviewGear } from './reserve-growth.ts'

/** Natural live-core progression; existing default-party final-affix runs are not repeated. */
export function latePartyTrial(name: string, party: JobId[], seed: number, minutes = 360) {
  const profile = newProfile('late-party', seed)
  profile.party.order = [...party, ...partyOrder.filter(job => !party.includes(job))]
  const game = createGame(profile, seed), ticksPerMinute = 60000 / REAL_TICK_MS
  const equipped = () => party.flatMap(job => Object.values(profile.party.members[job].equip))
  let previous = equipped(), updateCount = 0, lastUpdate = 0, longestNoUpdate = 0, lastClear = 0, longestNoClear = 0
  let fullDojoAt: number | null = null, firstFullBagAt: number | null = null
  const milestones: Array<{ rank: number; minute: number }> = [], walls: Record<string, number> = {}, samples = []
  const reached = new Set<string>()
  for (let tick = 1; tick <= minutes * ticksPerMinute; tick++) {
    const minute = tick / ticksPerMinute, result = advance(game)
    for (const event of result.events) {
      if (event.t !== 'phase') continue
      const key = `${event.depthRank ?? game.world.depthRank}:${event.stageNo}`
      if (event.phase === 'wipe') walls[key] = (walls[key] ?? 0) + 1
      if (event.phase === 'stageClear' && !reached.has(key)) {
        reached.add(key); longestNoClear = Math.max(longestNoClear, minute - lastClear); lastClear = minute
        if (event.stageNo === 100) milestones.push({ rank: event.depthRank ?? game.world.depthRank, minute })
      }
    }
    if (tick % ticksPerMinute === 0) {
      reviewGear(game, party)
      const entries = buildView(profile, game.world.loop).dojo
      const purchase = entries.filter(entry => entry.affordable).sort((a, b) => a.cost - b.cost)[0]
      if (purchase) {
        const result = runCommand(game, { c: 'buyDojo', key: purchase.key })
        if (!result.ok) throw new Error(result.reason)
      }
      if (fullDojoAt === null && entries.every(entry => entry.max !== null && profile.dojo[entry.key] >= entry.max)) fullDojoAt = minute
    }
    const current = equipped(), changed = current.reduce((count, id, index) => count + Number(id !== previous[index]), 0)
    if (changed) { updateCount += changed; longestNoUpdate = Math.max(longestNoUpdate, minute - lastUpdate); lastUpdate = minute; previous = current }
    if (profile.inventory.length >= 100 && firstFullBagAt === null) firstFullBagAt = minute
    if (tick % (30 * ticksPerMinute) === 0) samples.push({ minute, difficulty: game.world.depthRank, floor: game.world.stageNo,
      levels: party.map(job => profile.party.members[job].lv), wipes: profile.stats.wipes, kills: profile.stats.kills,
      koban: profile.koban, totalKoban: profile.stats.totalKoban, drops: profile.stats.drops, gearUpdates: updateCount,
      inventory: profile.inventory.length, dojo: { ...profile.dojo }, equipped: current.map(id => {
        const item = id === null ? null : profile.inventory.find(item => item.id === id)
        if (id !== null && !item) throw new Error('Missing equipped item')
        return item ? { rank: item.ilvl, rarity: item.rarity, engraving: item.engraving ?? null } : null
      }) })
  }
  return { name, party, seed, minutes, milestones, walls, fullDojoAt, firstFullBagAt,
    longestNoUpdate: Math.max(longestNoUpdate, minutes - lastUpdate), longestNoClear: Math.max(longestNoClear, minutes - lastClear), samples }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? '.dev-data/party-late-final-affix.json')
  mkdirSync(resolve(output, '..'), { recursive: true })
  const results: ReturnType<typeof latePartyTrial>[] = []
  for (const [name, party] of Object.entries(auditParties).filter(([name]) => name !== 'default')) for (const seed of [1, 2]) {
    const result = latePartyTrial(name, party, seed); results.push(result)
    writeFileSync(output, JSON.stringify({ conditions: 'Natural six-hour live-core simulation, non-default representative parties; two seeds each, sequential. Existing final-affix default data reused separately. Review positive-score gear once/minute, do not automate engraving tradeoffs; buy cheapest available convenience dojo. No human play, fabricated levels, external GUI, or reserve EXP.', results }, null, 2))
    console.log(JSON.stringify({ name, seed, end: result.samples.at(-1), milestones: result.milestones,
      noUpdateMinutes: result.longestNoUpdate, noClearMinutes: result.longestNoClear, fullDojoAt: result.fullDojoAt }))
  }
}
