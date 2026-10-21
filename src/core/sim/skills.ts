import { balance as b } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { jobs } from '../data/jobs.ts'
import { addEffect, aoe, healUnit, passiveOn, strike } from './actions.ts'
import { friends, living, opponents } from './combat.ts'
import { random } from './rng.ts'
import { sumEffects, withEffects } from './stats.ts'
import { FOREVER, ticks } from './time.ts'
import type { JobId, SimEvent, Unit, World } from './types.ts'

export interface SkillContext { world: World; self: Unit; events: SimEvent[] }
const p = (job: JobId, kind: 'skill' | 'passive' | 'ultimate') => jobs[job][kind].params
const lowestRatio = (units: Unit[]) => units.reduce((best, unit) => unit.hp / unit.stats.maxHp < best.hp / best.stats.maxHp ? unit : best)
const hasFoes = ({ world, self }: SkillContext) => opponents(world, self).length > 0
const consolation = (world: World, amount: number) => Math.floor(amount * b.rewardGrowth ** (world.stageNo - 1))

export const skills: Record<string, { canUse(ctx: SkillContext): boolean; use(ctx: SkillContext): void }> = {
  iai: {
    canUse: (ctx) => hasFoes(ctx) && !ctx.self.effects.some((effect) => effect.kind === 'nextCrit'),
    use: ({ self, events }) => addEffect(self, { kind: 'nextCrit', tag: 'iai', value: p('samurai', 'skill').mul, untilTick: FOREVER, sourceUid: self.uid }, events),
  },
  kage: {
    canUse: hasFoes,
    use: ({ world, self, events }) => addEffect(self, { kind: 'evaAdd', tag: 'kage', value: p('ninja', 'skill').eva,
      untilTick: world.tick + ticks(p('ninja', 'skill').ms), sourceUid: self.uid }, events),
  },
  mine: {
    canUse: (ctx) => hasFoes(ctx) && !ctx.world.mines.some((mine) => mine.ownerUid === ctx.self.uid),
    use: ({ world, self }) => {
      const front = opponents(world, self).reduce((best, unit) => unit.x < best.x ? unit : best)
      world.mines.push({ id: world.nextId++, ownerUid: self.uid, x: front.x, armTick: world.tick + ticks(b.mineArmMs),
        explodeTick: world.tick + ticks(b.mineFuseMs), payload: { mul: p('jirai', 'skill').mul, aoeDots: b.mineRadiusDots, tags: ['mine'] } })
    },
  },
  sashiire: {
    canUse: ({ world, self }) => friends(world, self).some((unit) => unit.hp / unit.stats.maxHp < p('otaku', 'skill').below),
    use: ({ world, self, events }) => {
      const target = lowestRatio(friends(world, self)), q = p('otaku', 'skill')
      healUnit(target, self.stats.atk * q.mul + target.stats.maxHp * q.maxHp, self.uid, events)
    },
  },
  kakuhen: {
    canUse: hasFoes,
    use: ({ world, self, events }) => {
      const q = p('pachipro', 'skill')
      const hit = random(world) < Math.min(q.maxChance, q.chance + self.stats.luk * q.lukChance)
      events.push({ t: 'kakuhen', uid: self.uid, hit })
      if (!hit) { events.push({ t: 'reward', koban: consolation(world, q.consolation), exp: 0, enemyId: 'kakuhen', x: self.x }); return }
      const untilTick = world.tick + ticks(q.ms)
      for (const ally of friends(world, self)) {
        addEffect(ally, { kind: 'intervalPct', tag: 'kakuhen', value: q.interval, untilTick, sourceUid: self.uid }, events)
        addEffect(ally, { kind: 'kobanPct', tag: 'kakuhenKoban', value: q.koban, untilTick, sourceUid: self.uid }, events)
      }
    },
  },
}

/** Rolled when the cast starts so the strip can show the reels during the cast. */
export function rollOatari(world: World, self: Unit) {
  const q = p('pachipro', 'ultimate')
  const weights = Array.from({ length: q.max }, (_, index) => index === q.max - 1 ? 1 + self.stats.luk / q.lukDiv : 1)
  let roll = random(world) * weights.reduce((sum, weight) => sum + weight, 0)
  for (let index = 0; index < weights.length; index++) { roll -= weights[index]; if (roll < 0) return index + 1 }
  return q.max
}
export const ultimates: Record<string, (ctx: SkillContext, roll?: number) => void> = {
  issen: ({ world, self, events }) => aoe(world, self, p('samurai', 'ultimate').mul, events, ['issen']),
  mijin: ({ world, self, events }) => {
    aoe(world, self, p('ninja', 'ultimate').mul, events, ['mijin'])
    addEffect(self, { kind: 'invuln', tag: 'mijin', value: 1, untilTick: world.tick + ticks(p('ninja', 'ultimate').ms), sourceUid: self.uid }, events)
  },
  lovebomb: ({ world, self, events }) => {
    const q = p('jirai', 'ultimate')
    aoe(world, self, q.mul + (self.gauges.jonen ?? 0) / q.jonenDiv, events, ['lovebomb'])
    self.gauges.jonen = 0
  },
  ouen: ({ world, self, events }) => {
    const q = p('otaku', 'ultimate')
    for (const ally of friends(world, self)) {
      healUnit(ally, ally.stats.maxHp * q.heal, self.uid, events)
      addEffect(ally, { kind: 'intervalPct', tag: 'ouen', value: q.interval, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
    }
  },
  oatari: ({ world, self, events }, roll = 1) => {
    const q = p('pachipro', 'ultimate')
    aoe(world, self, roll, events, ['oatari'])
    if (roll === q.max) events.push({ t: 'reward', koban: consolation(world, q.bonus), exp: 0, enemyId: 'oatari', x: self.x })
  },
}

/** Boss skills fire instead of a normal attack when ready. Returns false when nothing is in reach. */
export function bossSkill({ world, self, events }: SkillContext): boolean {
  const boss = enemies[self.defId].boss
  if (!boss) return false
  const targets = opponents(world, self).filter((unit) => Math.abs(unit.x - self.x) <= self.stats.rangeDots + b.formationGap)
    .sort((a, z) => a.slot - z.slot).slice(0, boss.skill.targets)
  if (!targets.length) return false
  events.push({ t: 'skill', uid: self.uid, skillId: boss.skill.id })
  for (const target of targets) strike(world, self, target, { mul: boss.skill.mul, tags: [boss.skill.id] }, events)
  return true
}

export function onBattleStart(world: World, events: SimEvent[]) {
  for (const otaku of world.units.filter((unit) => living(unit) && passiveOn(unit, 'otaku'))) {
    for (const ally of friends(world, otaku)) {
      addEffect(ally, { kind: 'atkPct', tag: 'oshi', value: p('otaku', 'passive').atk, untilTick: FOREVER, sourceUid: otaku.uid }, events)
    }
  }
}

/** Recomputed every tick: effects first, then conditional passives and boss enrage. */
export function refreshStats(world: World, unit: Unit) {
  const stats = withEffects(unit.base, unit.effects)
  unit.aggro = 1 + sumEffects(unit.effects, 'aggroAdd')
  const ratio = unit.hp / unit.base.maxHp
  if (passiveOn(unit, 'samurai')) {
    const q = p('samurai', 'passive')
    const front = world.units.find((ally) => ally.side === 'ally' && living(ally))
    if (front === unit) { unit.aggro += q.aggro; stats.dmgTakenMul *= 1 + q.dmgTaken }
    if (ratio <= q.hpBelow) stats.atk *= 1 + q.atk
  }
  if (passiveOn(unit, 'jirai') && (unit.gauges.jonen ?? 0) >= p('jirai', 'passive').jonen) {
    stats.atk *= 1 + p('jirai', 'passive').atk; stats.dmgTakenMul *= 1 + p('jirai', 'passive').dmgTaken
  }
  const boss = unit.side === 'enemy' ? enemies[unit.defId].boss : undefined
  if (boss && ratio <= b.enrageHp) stats.intervalMs *= boss.enrageInterval
  unit.stats = stats
}
