import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { balance, createWorld, step, type JobId } from '../src/core/index.ts'
import { partyOrder } from '../src/core/data/jobs.ts'

export const formations: Record<string, JobId[]> = {
  assault: ['farmer', 'ninja', 'maid'],
  guard: ['bancho', 'ninja', 'maid'],
  healer: ['farmer', 'ninja', 'sister'],
  ward: ['rikishi', 'ninja', 'miko'],
  debuff: ['farmer', 'ninja', 'gariben'],
  default: ['samurai', 'ninja', 'otaku'],
  marked: ['bancho', 'maid', 'gyaru'],
  pressure: ['bancho', 'sukeban', 'gariben'],
  wardCounter: ['bancho', 'ninja', 'miko'],
}
/** Equal level, equal gear and equal attribute budget. No progression, consumables or test-only enemy changes. */
export function bossTrial(party: readonly JobId[], floor: number, seed: number, level = 15, equipment = 1) {
  const order = [...party, ...partyOrder.filter((id) => !party.includes(id))]
  const gear = Object.fromEntries(partyOrder.map((id) => [id, [{ atk: 25 * equipment, hp: 100 * equipment, def: 8 * equipment, affixes: [] }]]))
  const allocated = Object.fromEntries(partyOrder.map((id) => [id, { str: 10, dex: 10, vit: 10, int: 10 }]))
  const world = createWorld({ seed, stageNo: floor, level, order, gear, allocated })
  world.wave = 10
  let damageTaken = 0, healing = 0, deaths = 0, minHp = 1, interrupts = 0, hariteInterrupts = 0
  for (let i = 0; i < 180000 / balance.tickMs; i++) {
    const events = step(world)
    for (const event of events) {
      if (event.t === 'bossInterrupt') interrupts++
      if (event.t === 'bossInterrupt' && event.interruptSkillId === 'harite') hariteInterrupts++
      const target = 'uid' in event ? world.units.find((unit) => unit.uid === event.uid) : undefined
      if (target?.side !== 'ally') continue
      if (event.t === 'damage') damageTaken += event.amount
      // Wave-clear restoration is not a healer's contribution.
      if (event.t === 'heal' && world.phase === 'battle') healing += event.amount
      if (event.t === 'death') deaths++
    }
    if (world.phase === 'battle') minHp = Math.min(minHp, ...world.units.filter((u) => u.side === 'ally').map((u) => Math.max(0, u.hp / u.stats.maxHp)))
    if (world.phase === 'waveClear' || world.phase === 'wipe') return { result: world.phase, seconds: world.tick * balance.tickMs / 1000, damageTaken, healing, deaths, minHp, interrupts, hariteInterrupts }
  }
  return { result: 'timeout', seconds: 180, damageTaken, healing, deaths, minHp, interrupts, hariteInterrupts }
}

export function bossMatrix(seeds = 20) {
  return [10, 20, 30, 40, 50, 60].flatMap((floor) => Object.entries(formations).map(([formation, party]) => {
    const trials = Array.from({ length: seeds }, (_, i) => bossTrial(party, floor, i + 1))
    const avg = (key: 'seconds' | 'deaths' | 'damageTaken' | 'healing' | 'minHp' | 'interrupts' | 'hariteInterrupts') => Math.round(trials.reduce((sum, t) => sum + t[key], 0) / seeds * 100) / 100
    return { floor, formation, wins: trials.filter((t) => t.result === 'waveClear').length, wipes: trials.filter((t) => t.result === 'wipe').length, timeouts: trials.filter((t) => t.result === 'timeout').length, seeds, seconds: avg('seconds'), deaths: avg('deaths'), damageTaken: avg('damageTaken'), healing: avg('healing'), minHp: avg('minHp'), interrupts: avg('interrupts'), hariteInterrupts: avg('hariteInterrupts') }
  }))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Deterministic simulation, not human play: Lv15; STR/DEX/VIT/INT 10 each; flat gear ATK25/HP100/DEF8 for every member; no dojo or progression; boss wave + escorts; 180s limit. Timeouts are not wins or wipes. Healing excludes wave-clear restoration.')
  console.table(bossMatrix())
}
