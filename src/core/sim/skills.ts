import { balance as b } from '../data/balance.ts'
import { depthScale } from '../data/dungeon.ts'
import { enemies } from '../data/enemies.ts'
import { effectiveSkill } from '../data/skillEngravings.ts'
import { jobs } from '../data/jobs.ts'
import { addEffect, aoe, healUnit, passiveOn, pushEnemy, strike } from './actions.ts'
import { canReserveBossSkill } from './boss.ts'
import { friends, hasActiveTag, living, opponents } from './combat.ts'
import { random } from './rng.ts'
import { sumEffects, withEffects } from './stats.ts'
import { FOREVER, ticks } from './time.ts'
import type { JobId, SimEvent, Unit, World } from './types.ts'

export interface SkillContext { world: World; self: Unit; events: SimEvent[] }
function p(job: JobId, kind: 'skill' | 'passive' | 'ultimate', self?: Unit) {
  if (kind !== 'skill') return jobs[job][kind].params
  if (!self) throw new Error('Skill parameters require the acting unit')
  return effectiveSkill(jobs[job].skill, self.stats).params
}
const lowestRatio = (units: Unit[]) => units.reduce((best, unit) => unit.hp / unit.stats.maxHp < best.hp / best.stats.maxHp ? unit : best)
const hasFoes = ({ world, self }: SkillContext) => opponents(world, self).length > 0
const consolation = (world: World, amount: number) => Math.floor(amount * depthScale(world.stageNo, world.depthRank).reward)

/** Existing negative effects are the game's curses; cleansing removes only harmful modifiers. */
const cleanse = (unit: Unit, events: SimEvent[]) => {
  const harmful = unit.effects.filter((effect) => effect.kind === 'obsession'
    || (effect.value < 0 && ['atkPct', 'evaAdd', 'criAdd'].includes(effect.kind))
    || (effect.value > 0 && ['dmgTakenPct', 'intervalPct'].includes(effect.kind)))
  unit.effects = unit.effects.filter((effect) => !harmful.includes(effect))
  for (const effect of harmful) events.push({ t: 'effect', uid: unit.uid, tag: effect.tag, on: false })
}
const mikoWard = ({ world, self, events }: SkillContext, kind: 'skill' | 'ultimate') => {
  const q = p('miko', kind, self)
  for (const ally of friends(world, self)) {
    cleanse(ally, events)
    healUnit(ally, self.stats.atk * (q.healAtk ?? 0) + ally.stats.maxHp * q.healHp, self.uid, events)
    addEffect(ally, { kind: 'dmgTakenPct', tag: kind === 'skill' ? 'kekkai' : 'misogi', value: q.dmgTaken,
      untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
  }
}
const intimidate = ({ world, self, events }: SkillContext, kind: 'skill' | 'ultimate') => {
  const q = p('sukeban', kind, self)
  for (const enemy of opponents(world, self)) addEffect(enemy, { kind: 'atkPct', tag: kind === 'skill' ? 'ikaku' : 'kyouka',
    value: q.atk, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
}
const salvage = ({ world, self, events }: SkillContext, kind: 'skill' | 'ultimate') => {
  const q = p('vagabond', kind, self), untilTick = world.tick + ticks(q.ms)
  aoe(world, self, q.mul, events, [kind === 'skill' ? 'salvage' : 'junkstorm'])
  for (const enemy of opponents(world, self)) addEffect(enemy, { kind: 'atkPct', tag: 'junkWeakness', value: q.atk, untilTick, sourceUid: self.uid }, events)
  for (const ally of friends(world, self)) addEffect(ally, { kind: 'kobanPct', tag: 'salvageKoban', value: q.koban, untilTick, sourceUid: self.uid }, events)
}
const tonoCheer = ({ world, self, events }: SkillContext, kind: 'skill' | 'ultimate') => {
  const q = p('tono', kind, self), untilTick = world.tick + ticks(q.ms), tag = kind === 'skill' ? 'saihai' : 'onari'
  for (const ally of friends(world, self)) {
    addEffect(ally, { kind: 'atkPct', tag, value: q.atk, untilTick, sourceUid: self.uid }, events)
    if (q.interval) addEffect(ally, { kind: 'intervalPct', tag: 'onariSpeed', value: q.interval, untilTick, sourceUid: self.uid }, events)
  }
}
const examDebuff = ({ world, self, events }: SkillContext, kind: 'skill' | 'ultimate') => {
  const q = p('gariben', kind, self), untilTick = world.tick + ticks(q.ms)
  for (const enemy of opponents(world, self)) addEffect(enemy, { kind: 'intervalPct', tag: kind === 'skill' ? 'nanmon' : 'tetsuya', value: q.interval, untilTick, sourceUid: self.uid }, events)
  if (q.cri) for (const ally of friends(world, self)) addEffect(ally, { kind: 'criAdd', tag: 'examAnswer', value: q.cri, untilTick, sourceUid: self.uid }, events)
}
/** Retarget each throw after kills; the marked target enables a single opening critical. */
const knifeVolley = ({ world, self, events }: SkillContext, kind: 'skill' | 'ultimate') => {
  const q = p('maid', kind, self)
  for (let hit = 0; hit < q.hits; hit++) {
    const target = opponents(world, self).sort((a, z) => Number(hasActiveTag(world, z, 'attention')) - Number(hasActiveTag(world, a, 'attention'))
      || Math.abs(a.x - self.x) - Math.abs(z.x - self.x))[0]
    if (!target) break
    const markedOpening = hit === 0 && hasActiveTag(world, target, 'attention')
    strike(world, self, target, { mul: q.mul, forceCrit: markedOpening,
      tags: [kind === 'skill' ? 'knifevolley' : 'knifecurtain', ...(markedOpening ? ['markedOpening'] : [])] }, events)
  }
}
export const skills: Record<string, { canUse(ctx: SkillContext): boolean; use(ctx: SkillContext): void }> = {
  nanmon: { canUse: hasFoes, use: (ctx) => examDebuff(ctx, 'skill') },
  saihai: { canUse: hasFoes, use: (ctx) => tonoCheer(ctx, 'skill') },
  harite: { canUse: ({ world, self }) => {
      const q = p('rikishi', 'skill', self)
      const reachable = opponents(world, self).filter((target) => target.x >= self.x && target.x - self.x <= q.range)
      if (!reachable.length) return false
      if (reachable.some((target) => target.action.kind === 'cast')) return true
      // Hold briefly for an imminent charge instead of spending the interrupt on an escort.
      return !reachable.some((target) => canReserveBossSkill(world, target, ticks(q.bossReserveMs)))
    },
    use: ({ world, self, events }) => {
      const q = p('rikishi', 'skill', self), target = opponents(world, self).filter((enemy) => enemy.x >= self.x && enemy.x - self.x <= q.range)
        .sort((a, z) => Number(z.action.kind === 'cast') - Number(a.action.kind === 'cast') || a.x - z.x)[0]
      if (!target) return
      strike(world, self, target, { mul: q.mul, aoeDots: q.range, tags: ['harite'] }, events)
      if (living(target)) pushEnemy(self, target, q.push, 'harite')
      addEffect(self, { kind: 'dmgTakenPct', tag: 'harite', value: q.dmgTaken, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
    } },
  prayer: { canUse: ({ world, self }) => friends(world, self).some((unit) => unit.hp / unit.stats.maxHp < p('sister', 'skill', self).below),
    use: ({ world, self, events }) => {
      const target = lowestRatio(friends(world, self)), q = p('sister', 'skill', self)
      healUnit(target, self.stats.atk * q.mul + target.stats.maxHp * q.maxHp, self.uid, events)
    } },
  salvage: { canUse: hasFoes, use: (ctx) => salvage(ctx, 'skill') },
  kushizashi: { canUse: ({ world, self }) => opponents(world, self).some((target) => target.x >= self.x && target.x - self.x <= p('farmer', 'skill', self).range),
    use: ({ world, self, events }) => {
      const q = p('farmer', 'skill', self)
      for (const target of opponents(world, self).filter((target) => target.x >= self.x && target.x - self.x <= q.range).sort((a, z) => a.x - z.x).slice(0, q.targets)) {
        strike(world, self, target, { mul: q.mul, aoeDots: q.range, tags: ['kushizashi'] }, events)
      }
    } },
  knifevolley: { canUse: hasFoes, use: (ctx) => knifeVolley(ctx, 'skill') },
  hoppalm: { canUse: ({ world, self }) => opponents(world, self).some((target) => Math.abs(target.x - self.x) <= p('jiangshi', 'skill', self).range),
    use: ({ world, self, events }) => {
      const q = p('jiangshi', 'skill', self), target = opponents(world, self).filter((enemy) => Math.abs(enemy.x - self.x) <= q.range).sort((a, z) => Math.abs(a.x - self.x) - Math.abs(z.x - self.x))[0]
      if (!target) return
      strike(world, self, target, { mul: q.mul, aoeDots: q.range, tags: ['hoppalm'] }, events)
      addEffect(self, { kind: 'evaAdd', tag: 'hoppalm', value: q.eva, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
    } },
  kekkai: { canUse: hasFoes, use: (ctx) => mikoWard(ctx, 'skill') },
  tanka: { canUse: hasFoes, use: ({ world, self, events }) => {
    const q = p('bancho', 'skill', self), untilTick = world.tick + ticks(q.ms)
    addEffect(self, { kind: 'aggroAdd', tag: 'tanka', value: q.aggro, untilTick, sourceUid: self.uid }, events)
    addEffect(self, { kind: 'dmgTakenPct', tag: 'tankaGuard', value: q.dmgTaken, untilTick, sourceUid: self.uid }, events)
  } },
  decosnap: { canUse: hasFoes, use: ({ world, self, events }) => {
    const target = opponents(world, self).sort((a, z) => Math.abs(a.x - self.x) - Math.abs(z.x - self.x))[0]
    if (!target) return
    const q = p('gyaru', 'skill', self)
    addEffect(target, { kind: 'dmgTakenPct', tag: 'attention', value: q.dmgTaken, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
  } },
  ikaku: { canUse: hasFoes, use: (ctx) => intimidate(ctx, 'skill') },
  iai: {
    canUse: (ctx) => hasFoes(ctx) && !ctx.self.effects.some((effect) => effect.kind === 'nextCrit'),
    use: ({ self, events }) => addEffect(self, { kind: 'nextCrit', tag: 'iai', value: p('samurai', 'skill', self).mul, untilTick: FOREVER, sourceUid: self.uid }, events),
  },
  kage: {
    canUse: hasFoes,
    use: ({ world, self, events }) => addEffect(self, { kind: 'evaAdd', tag: 'kage', value: p('ninja', 'skill', self).eva,
      untilTick: world.tick + ticks(p('ninja', 'skill', self).ms), sourceUid: self.uid }, events),
  },
  mine: {
    canUse: (ctx) => hasFoes(ctx) && !ctx.world.mines.some((mine) => mine.ownerUid === ctx.self.uid),
    use: ({ world, self }) => {
      const front = opponents(world, self).reduce((best, unit) => unit.x < best.x ? unit : best)
      world.mines.push({ id: world.nextId++, ownerUid: self.uid, x: front.x, armTick: world.tick + ticks(b.mineArmMs),
        explodeTick: world.tick + ticks(b.mineFuseMs), payload: { mul: p('jirai', 'skill', self).mul, aoeDots: b.mineRadiusDots, tags: ['mine'] } })
    },
  },
  sashiire: {
    canUse: ({ world, self }) => friends(world, self).some((unit) => unit.hp / unit.stats.maxHp < p('otaku', 'skill', self).below),
    use: ({ world, self, events }) => {
      const target = lowestRatio(friends(world, self)), q = p('otaku', 'skill', self)
      healUnit(target, self.stats.atk * q.mul + target.stats.maxHp * q.maxHp, self.uid, events)
    },
  },
  kakuhen: {
    canUse: hasFoes,
    use: ({ world, self, events }) => {
      const q = p('pachipro', 'skill', self)
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
  tetsuya: (ctx) => examDebuff(ctx, 'ultimate'),
  onari: (ctx) => tonoCheer(ctx, 'ultimate'),
  ooichiban: ({ world, self, events }) => {
    const q = p('rikishi', 'ultimate')
    aoe(world, self, q.mul, events, ['ooichiban'])
    for (const enemy of opponents(world, self)) pushEnemy(self, enemy, q.push, 'ooichiban')
    addEffect(self, { kind: 'dmgTakenPct', tag: 'ooichiban', value: q.dmgTaken, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
  },
  sanctuary: ({ world, self, events }) => {
    const q = p('sister', 'ultimate')
    for (const ally of friends(world, self)) {
      healUnit(ally, ally.stats.maxHp * q.heal, self.uid, events)
      addEffect(ally, { kind: 'invuln', tag: 'sanctuary', value: 1, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
    }
  },
  junkstorm: (ctx) => salvage(ctx, 'ultimate'),
  houjou: ({ world, self, events }) => {
    const q = p('farmer', 'ultimate'); aoe(world, self, q.mul, events, ['houjou']); healUnit(self, self.stats.maxHp * q.heal, self.uid, events)
  },
  knifecurtain: (ctx) => {
    const { world, self, events } = ctx
    const q = p('maid', 'ultimate')
    knifeVolley(ctx, 'ultimate')
    addEffect(self, { kind: 'intervalPct', tag: 'knifecurtain', value: q.interval, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
  },
  hyakki: ({ world, self, events }) => {
    const q = p('jiangshi', 'ultimate'); aoe(world, self, q.mul, events, ['hyakki']); healUnit(self, self.stats.maxHp * q.heal, self.uid, events)
  },
  misogi: (ctx) => mikoWard(ctx, 'ultimate'),
  souchou: ({ world, self, events }) => {
    const q = p('bancho', 'ultimate')
    aoe(world, self, q.mul, events, ['souchou'])
    addEffect(self, { kind: 'dmgTakenPct', tag: 'souchou', value: q.dmgTaken, untilTick: world.tick + ticks(q.ms), sourceUid: self.uid }, events)
  },
  buzzlive: ({ world, self, events }) => {
    const q = p('gyaru', 'ultimate'), untilTick = world.tick + ticks(q.ms)
    for (const enemy of opponents(world, self)) addEffect(enemy, { kind: 'dmgTakenPct', tag: 'attention', value: q.dmgTaken, untilTick, sourceUid: self.uid }, events)
    for (const ally of friends(world, self)) addEffect(ally, { kind: 'intervalPct', tag: 'buzzlive', value: q.interval, untilTick, sourceUid: self.uid }, events)
  },
  kyouka: (ctx) => { aoe(ctx.world, ctx.self, p('sukeban', 'ultimate').mul, ctx.events, ['kyouka']); intimidate(ctx, 'ultimate') },
  issen: ({ world, self, events }) => {
    const q = p('samurai', 'ultimate')
    for (const enemy of opponents(world, self).sort((a, z) => a.x - z.x).slice(0, q.targets)) {
      strike(world, self, enemy, { mul: q.mul, aoeDots: b.rangedRange, tags: ['issen'] }, events)
    }
  },
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

export function onBattleStart(world: World, events: SimEvent[]) {
  for (const gariben of world.units.filter((unit) => living(unit) && passiveOn(unit, 'gariben'))) {
    for (const enemy of opponents(world, gariben)) addEffect(enemy, { kind: 'dmgTakenPct', tag: 'bunseki', value: p('gariben', 'passive').dmgTaken, untilTick: FOREVER, sourceUid: gariben.uid }, events)
  }
  for (const tono of world.units.filter((unit) => living(unit) && passiveOn(unit, 'tono'))) {
    for (const ally of friends(world, tono)) addEffect(ally, { kind: 'intervalPct', tag: 'osumitsuki', value: p('tono', 'passive').interval, untilTick: FOREVER, sourceUid: tono.uid }, events)
  }
  for (const sister of world.units.filter((unit) => living(unit) && passiveOn(unit, 'sister'))) {
    for (const ally of friends(world, sister)) addEffect(ally, { kind: 'deathWard', tag: 'deathward', value: 1, untilTick: FOREVER, sourceUid: sister.uid }, events)
  }
  for (const source of world.units.filter((unit) => living(unit) && (passiveOn(unit, 'miko') || passiveOn(unit, 'gyaru')))) {
    const miko = source.defId === 'miko'
    for (const ally of friends(world, source)) addEffect(ally, { kind: miko ? 'dmgTakenPct' : 'atkPct', tag: miko ? 'ofuda' : 'agemood',
      value: miko ? p('miko', 'passive').dmgTaken : p('gyaru', 'passive').atk, untilTick: FOREVER, sourceUid: source.uid }, events)
  }
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
  if (passiveOn(unit, 'rikishi')) stats.dmgTakenMul *= 1 + p('rikishi', 'passive').dmgTaken
  if (passiveOn(unit, 'farmer')) stats.eva = Math.min(b.maxEva, stats.eva + p('farmer', 'passive').eva)
  if (passiveOn(unit, 'maid')) stats.intervalMs *= 1 + p('maid', 'passive').interval
  const boss = unit.side === 'enemy' ? enemies[unit.defId].boss : undefined
  if (boss && ratio <= b.enrageHp) stats.intervalMs *= boss.enrageInterval
  unit.stats = stats
}
