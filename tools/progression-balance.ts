import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { advance, createGame, dojoCost, enemies, newProfile, runCommand } from '../src/core/index.ts'
import { dojo, type DojoKey } from '../src/core/data/progress.ts'
import { reviewGear } from './reserve-growth.ts'

/** Real drops and leveling from B1. Damage percentages use the actual equipped member's max HP. */
export function progressionTrial(seed: number, choices: boolean, minutes = 720, throughShura = false, throughAbyss = false) {
  const game = createGame(newProfile('balance', seed), seed)
  const reports: Array<{ difficulty: number; floor: number; minute: number; levels: number[]; wipes: number; hits: number; hitHpPercent: number; peakHpPercent: number;
    dojo: typeof game.profile.dojo; koban: number; earned: number; combatIncome: number;
    bossHits: number; bossHitHpPercent: number; stats: Array<{ job: string; hp: number; atk: number; def: number }> }> = []
  let hits = 0, fraction = 0, peak = 0, bossHits = 0, bossFraction = 0, measuredFloor = 1, measuredDifficulty = 0
  let combatIncome = 0
  const cleared = new Set<string>()
  let lastProgressTick = 0, longestProgressGap = { minutes: 0, difficulty: 0, floor: 1 }
  for (let tick = 0; tick < minutes * 600; tick++) {
    const { events } = advance(game)
    if (game.world.stageNo !== measuredFloor || game.world.depthRank !== measuredDifficulty) {
      measuredFloor = game.world.stageNo; measuredDifficulty = game.world.depthRank; hits = fraction = peak = bossHits = bossFraction = 0
    }
    for (const event of events) {
      if (event.t === 'phase' && event.phase === 'stageClear') {
        const key = `${game.world.depthRank}:${event.stageNo}`
        if (!cleared.has(key)) {
          const gap = (tick + 1 - lastProgressTick) / 600
          if (gap > longestProgressGap.minutes) longestProgressGap = { minutes: gap, difficulty: game.world.depthRank, floor: event.stageNo }
          cleared.add(key); lastProgressTick = tick + 1
        }
      }
      if (event.t === 'reward') combatIncome += event.koban
      if (event.t === 'damage') {
        const target = game.world.units.find((u) => u.uid === event.uid)
        if (target?.side === 'ally') {
          const value = event.amount / target.stats.maxHp
          hits++; fraction += value; peak = Math.max(peak, value)
          const source = game.world.units.find((u) => u.uid === event.sourceUid)
          if (source?.side === 'enemy' && enemies[source.defId].boss) { bossHits++; bossFraction += value }
        }
      }
      if (event.t === 'phase' && event.phase === 'stageClear' && (game.world.depthRank === 0 ? [30, 50, 80, 100] : [1, 10, 30, 50, 80, 100, 101]).includes(event.stageNo)
        && !reports.some((r) => r.floor === event.stageNo && r.difficulty === game.world.depthRank)) {
        reports.push({ difficulty: game.world.depthRank, floor: event.stageNo, minute: +((tick + 1) / 600).toFixed(2), levels: game.profile.offlineJobs.map((id) => game.profile.party.members[id].lv), wipes: game.profile.stats.wipes,
          dojo: { ...game.profile.dojo }, koban: Math.floor(game.profile.koban), earned: Math.floor(game.profile.stats.totalKoban), combatIncome,
          hits, hitHpPercent: +(fraction / Math.max(1, hits) * 100).toFixed(3), peakHpPercent: +(peak * 100).toFixed(3), bossHits, bossHitHpPercent: +(bossFraction / Math.max(1, bossHits) * 100).toFixed(3),
          stats: game.world.units.filter((u) => u.side === 'ally').map((u) => ({ job: u.defId, hp: Math.round(u.base.maxHp), atk: Math.round(u.base.atk), def: Math.round(u.base.def) })) })
        const targetReached = throughAbyss ? game.world.depthRank === 2 && event.stageNo === 101
          : throughShura ? game.world.depthRank === 1 && event.stageNo === 10 : game.world.depthRank === 0 && event.stageNo === 100
        if (targetReached) return { seed, choices, reports, completed: true, difficulty: game.world.depthRank, floor: game.world.stageNo, wipes: game.profile.stats.wipes, longestProgressGap }
      }
    }
    if (choices && tick % 600 === 0) {
      reviewGear(game, game.profile.offlineJobs)
      const cheapest = (Object.keys(dojo) as DojoKey[]).filter((key) => dojo[key].max === null || game.profile.dojo[key] < dojo[key].max!)
        .map((key) => ({ key, cost: dojoCost(key, game.profile.dojo[key]) })).filter((d) => d.cost <= game.profile.koban).sort((a, z) => a.cost - z.cost)[0]
      if (cheapest) runCommand(game, { c: 'buyDojo', key: cheapest.key })
    }
  }
  return { seed, choices, reports, completed: false, difficulty: game.world.depthRank, floor: game.world.stageNo, wipes: game.profile.stats.wipes, longestProgressGap,
    minutesSinceLastProgress: (minutes * 600 - lastProgressTick) / 600 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const seed of [1, 2, 3]) for (const choices of [true, false]) console.log(JSON.stringify(progressionTrial(seed, choices)))
}
