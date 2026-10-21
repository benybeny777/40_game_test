import { balance } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { jobs } from '../data/jobs.ts'
import { random } from './rng.ts'
import type { HitPayload, JobId, Stats, Unit, World } from './types.ts'
export const living = (unit: Unit) => unit.alive && unit.hp > 0
export const opponents = (world: World, self: Unit) => world.units.filter((unit) => unit.side !== self.side && living(unit))
export const friends = (world: World, self: Unit) => world.units.filter((unit) => unit.side === self.side && living(unit))
export function attackDef(unit: Unit) { return unit.side === 'ally' ? jobs[unit.defId as JobId].attack : enemies[unit.defId].attack }
export function chooseTarget(world: World, self: Unit): Unit | undefined {
  const candidates = opponents(world, self).filter((target) => Math.abs(target.x - self.x) <= self.stats.rangeDots)
  if (!candidates.length) return undefined
  if (self.side === 'enemy') {
    const front = candidates.reduce((best, target) => target.slot < best.slot ? target : best)
    const others = candidates.filter((target) => target !== front)
    if (!others.length || random(world) < balance.frontTargetChance) return front
    let roll = random(world) * others.reduce((sum, target) => sum + target.aggro, 0)
    for (const target of others) { roll -= target.aggro; if (roll < 0) return target }
    return others[others.length - 1]
  }
  if (attackDef(self).targeting === 'lowestHp') return candidates.reduce((best, target) => target.hp < best.hp ? target : best)
  return candidates.reduce((best, target) => Math.abs(target.x - self.x) < Math.abs(best.x - self.x) ? target : best)
}
export function resolveHit(atk: Stats, def: Stats, payload: HitPayload, rolls: readonly number[], options: { variance?: number; armored?: boolean; obsession?: boolean; invulnerable?: boolean } = {}) {
  const [evadeRoll, critRoll, varianceRoll] = rolls
  const crit = payload.forceCrit === true || critRoll < atk.cri
  const missed = options.invulnerable === true || (payload.aoeDots === undefined && evadeRoll < def.eva)
  const critMul = crit ? (options.armored ? 1 + (atk.criMul - 1) * balance.armorCritBonusMul : atk.criMul) : 1
  const variance = options.variance ?? balance.variance
  const amount = missed ? 0 : Math.floor(Math.max(1, atk.atk * payload.mul * balance.defBase / (balance.defBase + def.def * balance.defK)
    * (1 - variance + varianceRoll * (variance + variance)) * critMul * def.dmgTakenMul * (options.obsession ? balance.obsessionMul : 1)))
  return { missed, crit: !missed && crit, amount }
}
