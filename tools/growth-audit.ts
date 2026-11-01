import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { advance, createGame, newProfile, runCommand, dojoCost } from '../src/core/index.ts'
import { balance } from '../src/core/data/balance.ts'
import { growthBalance } from '../src/core/data/growth.ts'
import { dojo } from '../src/core/data/progress.ts'
import { availableDojoKeys } from '../src/core/progress/dojoRefund.ts'
import { isBossFloor } from '../src/core/data/dungeon.ts'
import { REAL_TICK_MS } from '../src/core/data/timing.ts'
import { reviewGear } from './reserve-growth.ts'

const targetLevels = [5, 10, 20, 40, 60, 80, 90, 100]
export function growthTrial(seed: number, maxMinutes = 2880) {
  const profile = newProfile('growth-audit', seed), game = createGame(profile, seed)
  const party = [...profile.offlineJobs], ticksPerMinute = 60000 / REAL_TICK_MS
  const levelTimes = Object.fromEntries(party.map(job => [job, Object.fromEntries(targetLevels.map(level => [level, null as number | null]))]))
  const clears: Array<{ difficulty: number; minute: number }> = []
  const bossFailures: Record<string, { floorWipes: number; bossWaveWipes: number }> = {}
  const snapshot = (minute: number) => ({ minute, difficulty: game.world.depthRank, floor: game.world.stageNo,
    best: [...profile.progress.unlockedDepths], levels: party.map(job => profile.party.members[job].lv),
    exp: party.map(job => profile.party.members[job].exp), wipes: profile.stats.wipes, kills: profile.stats.kills,
    dojo: { ...profile.dojo }, equipment: Object.fromEntries(party.map(job => [job,
      Object.fromEntries(Object.entries(profile.party.members[job].equip).map(([slot, id]) => {
        const item = id === null ? null : profile.inventory.find(item => item.id === id)
        if (id !== null && !item) throw new Error('Equipped item missing in growth audit')
        return [slot, item ? { id, rank: item.ilvl, rarity: item.rarity, name: item.name } : null]
      }))])) })
  const samples = [snapshot(0)]
  let tick: number, reachedCap = false
  for (tick = 1; tick <= maxMinutes * ticksPerMinute; tick++) {
    const minute = tick / ticksPerMinute, result = advance(game)
    for (const event of result.events) {
      if (event.t === 'levelUp' && targetLevels.includes(event.lv) && levelTimes[event.job]?.[event.lv] === null) levelTimes[event.job][event.lv] = minute
      if (event.t !== 'phase') continue
      if (event.phase === 'stageClear' && event.stageNo === 100 && !clears.some(clear => clear.difficulty === event.depthRank)) {
        clears.push({ difficulty: event.depthRank ?? game.world.depthRank, minute })
      }
      if (event.phase === 'wipe' && isBossFloor(event.stageNo)) {
        const key = `${event.depthRank ?? game.world.depthRank}:${event.stageNo}`
        const record = bossFailures[key] ??= { floorWipes: 0, bossWaveWipes: 0 }
        record.floorWipes++; if (event.wave === balance.waves) record.bossWaveWipes++
      }
    }
    if (tick % ticksPerMinute === 0) {
      reviewGear(game, party)
      const candidate = availableDojoKeys.filter(key => dojo[key].max === null || profile.dojo[key] < dojo[key].max!)
        .map(key => ({ key, cost: dojoCost(key, profile.dojo[key]) })).filter(entry => entry.cost <= profile.koban)
        .sort((a, b) => a.cost - b.cost)[0]
      if (candidate) {
        const result = runCommand(game, { c: 'buyDojo', key: candidate.key })
        if (!result.ok) throw new Error(result.reason)
      }
      if (minute % 5 === 0) samples.push(snapshot(minute))
      if (minute % 240 === 0) console.log(JSON.stringify({ seed, progressMinutes: minute, levels: party.map(job => profile.party.members[job].lv), difficulty: game.world.depthRank, floor: game.world.stageNo, wipes: profile.stats.wipes }))
    }
    if (party.every(job => profile.party.members[job].lv === balance.maxLevel)) { reachedCap = true; break }
  }
  const elapsedMinutes = Math.min(tick, maxMinutes * ticksPerMinute) / ticksPerMinute
  return { seed, maxMinutes, reachedCap, elapsedMinutes, levelTimes, clears, bossFailures, samples, final: snapshot(elapsedMinutes) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? '.dev-data/growth-final.json')
  mkdirSync(resolve(output, '..'), { recursive: true })
  const results: ReturnType<typeof growthTrial>[] = []
  for (const seed of [1, 2, 3]) {
    const result = growthTrial(seed); results.push(result)
    writeFileSync(output, JSON.stringify({ maxLevel: balance.maxLevel, growthBalance,
      conditions: 'Candidate6, default party from new profile. Actual acquired gear reviewed once/minute, convenience dojo only; no fabricated level, no bench EXP, no GUI. Stop when all deployed members reach level cap or 48 real-time-equivalent hours. Unreached milestones remain null. Boss-wave wipes distinguish waves 1-9 on the same floor.', results }, null, 2))
    console.log(JSON.stringify({ seed, reachedCap: result.reachedCap, elapsedMinutes: result.elapsedMinutes, levelTimes: result.levelTimes, clears: result.clears, final: result.final }))
  }
}
