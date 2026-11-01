import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { advance, createGame, dojoCost, newProfile, runCommand, type Game } from '../src/core/index.ts'
import { balance } from '../src/core/data/balance.ts'
import { dojo } from '../src/core/data/progress.ts'
import { availableDojoKeys } from '../src/core/progress/dojoRefund.ts'
import { REAL_TICK_MS } from '../src/core/data/timing.ts'
import { reviewGear } from './reserve-growth.ts'

type GearPolicy = 'update' | 'fixed-after-5m' | 'none'
const equipment = (game: Game) => Object.fromEntries(game.profile.offlineJobs.map(job => [job,
  Object.fromEntries(Object.entries(game.profile.party.members[job].equip).map(([slot, id]) => [slot,
    id === null ? null : structuredClone(game.profile.inventory.find(item => item.id === id)!)]))]))
export function gearTrial(seed: number, gear: GearPolicy, trainDojo: boolean, minutes = 200) {
  const profile = newProfile('gear-dependency-audit', seed)
  profile.options.autoEquip = gear !== 'none'
  const game = createGame(profile, seed), ticksPerMinute = 60000 / REAL_TICK_MS
  const milestones: Array<{ rank: number; floor: number; minute: number }> = []
  const samples: Array<{ minute: number; rank: number; floor: number; levels: number[]; wipes: number }> = []
  let fixedEquipment: ReturnType<typeof equipment> | null = null
  for (let tick = 1; tick <= minutes * ticksPerMinute; tick++) {
    const { events } = advance(game)
    for (const event of events) if (event.t === 'phase' && event.phase === 'stageClear' && event.stageNo === 100
      && !milestones.some(point => point.rank === event.depthRank)) {
      milestones.push({ rank: event.depthRank ?? game.world.depthRank, floor: 100, minute: tick / ticksPerMinute })
    }
    if (tick % ticksPerMinute === 0) {
      const minute = tick / ticksPerMinute
      if (gear === 'update' || (gear === 'fixed-after-5m' && minute <= 5)) reviewGear(game, profile.offlineJobs)
      if (gear === 'fixed-after-5m' && minute === 5) {
        fixedEquipment = equipment(game)
        const result = runCommand(game, { c: 'setOptions', autoEquip: false })
        if (!result.ok) throw new Error(result.reason)
      }
      if (trainDojo) {
        const candidate = availableDojoKeys
          .filter(key => dojo[key].max === null || profile.dojo[key] < dojo[key].max!)
          .map(key => ({ key, cost: dojoCost(key, profile.dojo[key]) }))
          .filter(entry => entry.cost <= profile.koban).sort((a, b) => a.cost - b.cost)[0]
        if (candidate) {
          const result = runCommand(game, { c: 'buyDojo', key: candidate.key })
          if (!result.ok) throw new Error(result.reason)
        }
      }
      if (minute % 10 === 0) samples.push({ minute, rank: game.world.depthRank, floor: game.world.stageNo,
        levels: profile.offlineJobs.map(job => profile.party.members[job].lv), wipes: profile.stats.wipes })
    }
  }
  const finalEquipment = equipment(game)
  if (fixedEquipment && JSON.stringify(finalEquipment) !== JSON.stringify(fixedEquipment)) throw new Error('Fixed gear changed')
  if (gear === 'none' && profile.offlineJobs.some(job => Object.values(profile.party.members[job].equip).some(id => id !== null))) throw new Error('Naked policy equipped an item')
  return { seed, gear, trainDojo, minutes, milestones, samples, final: samples.at(-1), best: profile.progress.unlockedDepths,
    kills: profile.stats.kills, dojo: profile.dojo, fixedEquipment, equipment: finalEquipment }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const minutes = Number(process.argv[2] ?? 200), path = resolve(process.argv[3] ?? '.dev-data/gear-dependency-before.json')
  if (!Number.isSafeInteger(minutes) || minutes < 5) throw new Error('Minutes must be an integer >= 5')
  mkdirSync(resolve(path, '..'), { recursive: true })
  const results: ReturnType<typeof gearTrial>[] = []
  for (const gear of ['update', 'fixed-after-5m', 'none'] as const) for (const trainDojo of [true, false]) for (const seed of [1, 2, 3]) {
    const result = gearTrial(seed, gear, trainDojo, minutes); results.push(result)
    writeFileSync(path, JSON.stringify({ maxLevel: balance.maxLevel, expBase: balance.expBase, expPow: balance.expPow,
      policy: 'Natural default-party progression; gear review once/minute; fixed gear freezes actual acquired gear at minute 5; dojo buys cheapest affordable once/minute; no GUI or fabricated level/items.', results }, null, 2))
    console.log(JSON.stringify({ seed, gear, trainDojo, milestones: result.milestones, final: result.final }))
  }
}
