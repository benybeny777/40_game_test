import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { advance, createGame, dojoCost, newProfile, runCommand, partyOrder, type JobId } from '../src/core/index.ts'
import { dojo, type DojoKey } from '../src/core/data/progress.ts'
import { REAL_TICK_MS } from '../src/core/data/timing.ts'
import { reviewGear } from './reserve-growth.ts'

export const auditParties: Record<string, JobId[]> = {
  default: ['samurai', 'ninja', 'otaku'],
  wardCounter: ['bancho', 'ninja', 'miko'],
  marked: ['jiangshi', 'maid', 'gyaru'],
  pressure: ['bancho', 'sukeban', 'gariben'],
  economy: ['vagabond', 'pachipro', 'tono'],
  healer: ['rikishi', 'jirai', 'sister'],
  assault: ['farmer', 'ninja', 'maid'],
  tanks: ['bancho', 'rikishi', 'jiangshi'],
  support: ['miko', 'tono', 'sister'],
}
const round = (n: number) => Math.round(n * 100) / 100
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null

/** Actual game progression from B1; automated choices, no fabricated gear/levels or GUI. */
export function partyTrial(name: string, party: JobId[], seed: number, minutes = 60, replacement?: { minute: number; from: JobId; to: JobId }) {
  const profile = newProfile('party-audit', seed)
  profile.party.order = [...party, ...partyOrder.filter(job => !party.includes(job))]
  profile.offlineJobs = [...party]
  const game = createGame(profile, seed)
  let activeParty = [...party]
  const phaseMs: Record<string, number> = {}, attacks: Record<string, number> = {}, damage: Record<string, number> = {}
  const milestones: Array<{ rank: number; floor: number; minute: number }> = []
  const samples: Array<{ minute: number; rank: number; floor: number; best: number[]; kills: number; wipes: number; levels: number[] }> = []
  const lifetimes: number[] = [], born = new Map<number, number>()
  let lastProgress = 0, longestStall = 0, stallFloor = 1, damageIdleMs = 0, longestBattleSilence = 0
  let killCount = 0, attackCount = 0, skillCount = 0, battleMs = 0
  const ticksPerMinute = 60000 / REAL_TICK_MS, seenFloors = new Set<string>()
  for (let tick = 1; tick <= minutes * ticksPerMinute; tick++) {
    const now = tick * REAL_TICK_MS
    const units = new Map(game.world.units.map(unit => [unit.uid, unit]))
    const phase = game.world.phase
    phaseMs[phase] = (phaseMs[phase] ?? 0) + REAL_TICK_MS
    const { events } = advance(game)
    for (const unit of game.world.units) units.set(unit.uid, unit)
    let hit = false
    if (phase === 'battle') { battleMs += REAL_TICK_MS; damageIdleMs += REAL_TICK_MS } else damageIdleMs = 0
    for (const event of events) {
      if (event.t === 'spawn' && units.get(event.uid)?.side === 'enemy') born.set(event.uid, now)
      if (event.t === 'death' && units.get(event.uid)?.side === 'enemy') {
        killCount++
        const start = born.get(event.uid)
        if (start !== undefined) lifetimes.push((now - start) / 1000)
        born.delete(event.uid)
      }
      if (event.t === 'attack' && units.get(event.uid)?.side === 'ally') {
        attackCount++; const job = units.get(event.uid)!.defId; attacks[job] = (attacks[job] ?? 0) + 1
      }
      if ((event.t === 'skill' || event.t === 'ultimate') && units.get(event.uid)?.side === 'ally') skillCount++
      if (event.t === 'damage' && units.get(event.uid)?.side === 'enemy') {
        hit = true; const job = units.get(event.sourceUid)?.defId ?? 'unknown'; damage[job] = (damage[job] ?? 0) + event.amount
      }
      if (event.t === 'phase' && event.phase === 'stageClear') {
        const rank = event.depthRank ?? game.world.depthRank, key = `${rank}:${event.stageNo}`
        if (!seenFloors.has(key)) {
          seenFloors.add(key)
          if (now - lastProgress > longestStall) { longestStall = now - lastProgress; stallFloor = event.stageNo }
          lastProgress = now
          if ([1, 10, 20, 30, 50, 80, 100].includes(event.stageNo)) milestones.push({ rank, floor: event.stageNo, minute: round(now / 60000) })
        }
      }
    }
    longestBattleSilence = Math.max(longestBattleSilence, damageIdleMs)
    if (hit) damageIdleMs = 0
    if (tick % ticksPerMinute === 0) {
      if (replacement && tick === replacement.minute * ticksPerMinute) {
        activeParty = activeParty.map(job => job === replacement.from ? replacement.to : job)
        const result = runCommand(game, { c: 'reorderParty', order: [...activeParty, ...partyOrder.filter(job => !activeParty.includes(job))] })
        if (!result.ok) throw new Error(result.reason)
      }
      reviewGear(game, activeParty)
      const purchase = (Object.keys(dojo) as DojoKey[]).filter(key => dojo[key].max === null || profile.dojo[key] < dojo[key].max!)
        .map(key => ({ key, cost: dojoCost(key, profile.dojo[key]) })).filter(entry => entry.cost <= profile.koban).sort((a, b) => a.cost - b.cost)[0]
      if (purchase) {
        const result = runCommand(game, { c: 'buyDojo', key: purchase.key })
        if (!result.ok) throw new Error(result.reason)
      }
      if (tick % (ticksPerMinute * 5) === 0) samples.push({ minute: now / 60000, rank: game.world.depthRank, floor: game.world.stageNo,
        best: [...profile.progress.unlockedDepths], kills: profile.stats.kills, wipes: profile.stats.wipes, levels: activeParty.map(job => profile.party.members[job].lv) })
    }
  }
  return { name, party, replacement, seed, minutes, milestones, samples, phaseMs, attacks, damage,
    longestProgressGapMinutes: round(Math.max(longestStall, minutes * 60000 - lastProgress) / 60000), stallFloor,
    sinceLastProgressMinutes: round((minutes * 60000 - lastProgress) / 60000),
    killsPerMinute: round(killCount / minutes), attackStartsPerBattleSecond: round(attackCount / (battleMs / 1000)),
    skillsPerBattleMinute: round(skillCount / (battleMs / 60000)), battlePercent: round(battleMs / (minutes * 600)),
    medianEnemyLifetimeSeconds: percentile(lifetimes, 0.5), p90EnemyLifetimeSeconds: percentile(lifetimes, 0.9),
    longestBattleDamageSilenceSeconds: round(longestBattleSilence / 1000), dojo: profile.dojo }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const minutes = Number(process.argv[2] ?? 60), output = resolve(process.argv[3] ?? '.dev-data/party-balance-audit.json')
  const results: ReturnType<typeof partyTrial>[] = []
  mkdirSync(resolve(output, '..'), { recursive: true })
  for (const [name, party] of Object.entries(auditParties)) for (const seed of [1, 2, 3]) {
    const result = partyTrial(name, party, seed, minutes); results.push(result)
    writeFileSync(output, JSON.stringify({ minutes, policy: 'One reviewGear and one cheapest affordable dojo purchase per minute; auto-stats and auto-equip defaults; no engraving choice automation.', results }, null, 2))
    console.log(JSON.stringify({ name, seed, last: result.samples.at(-1), gap: result.longestProgressGapMinutes, lifetime: result.p90EnemyLifetimeSeconds }))
  }
}
