import { balance as b } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { jobs } from '../data/jobs.ts'
import { friends, living, opponents, resolveHit } from './combat.ts'
import { random } from './rng.ts'
import { ticks } from './time.ts'
import type { Effect, HitPayload, SimEvent, Unit, World } from './types.ts'

export function addEffect(unit: Unit, effect: Effect, events: SimEvent[]) {
  unit.effects = unit.effects.filter((current) => current.tag !== effect.tag)
  unit.effects.push(effect)
  events.push({ t: 'effect', uid: unit.uid, tag: effect.tag, on: true })
}
export function healUnit(unit: Unit, amount: number, sourceUid: number, events: SimEvent[]) {
  if (!living(unit)) return
  const actual = Math.min(amount, unit.stats.maxHp - unit.hp)
  if (actual > 0) { unit.hp += actual; events.push({ t: 'heal', uid: unit.uid, sourceUid, amount: actual }) }
}
export const passiveOn = (unit: Unit, job: string) => unit.side === 'ally' && unit.defId === job && unit.lv >= b.passiveLv
const ultOn = (unit: Unit) => unit.side === 'ally' && unit.lv >= b.ultLv
export function strike(world: World, owner: Unit, target: Unit, payload: HitPayload, events: SimEvent[]) {
  let attacker = owner.stats
  const ninja = jobs.ninja.passive.params
  if (passiveOn(owner, 'ninja') && target.hp / target.stats.maxHp < ninja.hpBelow) attacker = { ...attacker, cri: attacker.cri + ninja.cri }
  // Always consume all three rolls in hit/crit/variance order, even for misses.
  const result = resolveHit(attacker, target.stats, payload, [random(world), random(world), random(world)], {
    armored: target.side === 'enemy' && enemies[target.defId].armored,
    obsession: target.effects.some((effect) => effect.kind === 'obsession'),
    invulnerable: target.effects.some((effect) => effect.kind === 'invuln'),
  })
  if (result.missed) { events.push({ t: 'miss', uid: target.uid, sourceUid: owner.uid }); return }
  const amount = Math.min(target.hp, result.amount)
  target.hp -= amount
  events.push({ t: 'damage', uid: target.uid, sourceUid: owner.uid, amount, crit: result.crit, tags: payload.tags })
  if (ultOn(owner)) owner.ult = Math.min(b.maxGauge, owner.ult + b.ultFromDealt * amount / owner.stats.atk)
  if (ultOn(target)) target.ult = Math.min(b.maxGauge, target.ult + b.ultFromTaken * amount / target.stats.maxHp)
  if (target.side === 'ally') for (const jirai of friends(world, target).filter((unit) => unit.defId === 'jirai')) {
    jirai.gauges.jonen = Math.min(b.maxGauge, (jirai.gauges.jonen ?? 0) + b.jonenFromTaken * amount / target.stats.maxHp)
  }
  if (owner.defId === 'jirai' && owner.side === 'ally' && target.hp > 0) {
    addEffect(target, { tag: 'obsession', kind: 'obsession', value: b.obsessionMul - 1, untilTick: world.tick + ticks(b.obsessionMs), sourceUid: owner.uid }, events)
  }
}
export function aoe(world: World, owner: Unit, mul: number, events: SimEvent[], tags: string[], center?: { x: number; radius: number }) {
  const targets = opponents(world, owner).filter((unit) => !center || Math.abs(unit.x - center.x) <= center.radius)
  for (const target of targets) strike(world, owner, target, { mul, aoeDots: center?.radius ?? b.rangedRange, tags }, events)
}
/** Party-wide koban multiplier: the pachipro passive plus the strongest active kobanPct effect (確変). */
export function kobanMul(world: World) {
  const allies = world.units.filter((unit) => unit.side === 'ally')
  let mul = 1
  if (allies.some((unit) => passiveOn(unit, 'pachipro'))) mul += jobs.pachipro.passive.params.koban
  for (const unit of allies) mul += unit.base.kobanMul - 1          // 装備の「獲得小判」
  mul += Math.max(0, ...allies.flatMap((unit) => unit.effects.filter((effect) => effect.kind === 'kobanPct').map((effect) => effect.value)))
  return mul
}
