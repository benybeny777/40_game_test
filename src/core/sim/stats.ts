import { attributeBalance as ab, attributeDefs, emptyAttributes, type Attributes } from '../data/attributes.ts'
import { engravingBalance } from '../data/skillEngravings.ts'
import type { JobDef } from '../data/jobs.ts'
import { balance } from '../data/balance.ts'
import { attributeBenefit, effectiveGrowthLevels, growthBalance } from '../data/growth.ts'
import { gearContribution } from './gearContribution.ts'
import type { AffixKey } from '../data/items.ts'
import type { Stats, Effect, GearStats } from './types.ts'
export interface DojoLevels { atk?: number; hp?: number; walk?: number; drop?: number }
// HP/ATK/DEF grow multiplicatively, CRI/EVA/LUK additively (01-core.md §7).
// Shared effective gear values are applied before percentage affixes.
export function computeStats(job: JobDef, lv: number, _dojo: DojoLevels = {}, gear: readonly GearStats[] = [], allocated: Attributes = emptyAttributes()): Stats {
  if (!Number.isInteger(lv) || lv < 1 || lv > balance.maxLevel) throw new RangeError(`Lv must be 1..${balance.maxLevel}`)
  void _dojo // Retained call signature for legacy callers; combat upgrades are retired.
  const n = effectiveGrowthLevels(lv), g = job.growth, s = job.base
  const main = allocated[attributeDefs[job.id].main]
  const flat = (key: 'atk' | 'hp' | 'def') => gear.reduce((sum, item) => sum + gearContribution(item)[key], 0)
  const benefit = (key: keyof typeof growthBalance.attributeCaps, points: number) => attributeBenefit(points, ab[key], growthBalance.attributeCaps[key])
  const affix = (key: AffixKey) => gear.reduce((sum, item) => sum + item.affixes.filter((entry) => entry.k === key).reduce((total, entry) => total + entry.v, 0), 0)
  const engraving = gear.find(item => item.engraving)?.engraving
  return { ...s,
    skillPowerMul: engraving === 'focus' ? engravingBalance.effectMul : 1,
    skillDurationMul: engraving === 'duration' ? engravingBalance.effectMul : 1,
    maxHp: (s.maxHp * (1 + g.hp * n * growthBalance.innateHpGrowth) + benefit('vitHp', allocated.vit) + flat('hp')) * (1 + affix('hpPct')),
    atk: (s.atk * growthBalance.innateAttack * (1 + g.atk * n) + flat('atk')) * (1 + benefit('mainAtk', main)) * (1 + affix('atkPct')),
    def: (s.def * (1 + g.def * n) + benefit('vitDef', allocated.vit) + benefit('strDef', allocated.str) + flat('def')) * (1 + affix('defPct')),
    intervalMs: s.intervalMs * balance.allyAttackIntervalMul * Math.max(balance.minIntervalMul, 1 + affix('intervalPct') - benefit('dexInterval', allocated.dex)),
    cri: Math.min(1, s.cri + g.cri * n + affix('cri') + benefit('dexCri', allocated.dex)), criMul: s.criMul + affix('criMul'),
    eva: Math.min(balance.maxEva, s.eva + g.eva * n + affix('eva') + benefit('dexEva', allocated.dex)), luk: s.luk + g.luk * n + affix('luk'),
    dmgTakenMul: Math.max(balance.minIntervalMul, 1 + affix('dmgTakenPct')), kobanMul: 1 + affix('kobanPct'), dropMul: 1 + affix('dropPct'), cooldownMul: Math.max(balance.minIntervalMul, 1 + affix('cooldownPct')) * (engraving ? engravingBalance.cooldownMul : 1) }
}
export const sumEffects = (effects: readonly Effect[], kind: Effect['kind']) =>
  effects.filter((effect) => effect.kind === kind).reduce((total, effect) => total + effect.value, 0)
export function withEffects(base: Stats, effects: readonly Effect[]): Stats {
  const sum = (kind: Effect['kind']) => sumEffects(effects, kind)
  return { ...base, atk: base.atk * (1 + sum('atkPct')), cri: Math.min(1, base.cri + sum('criAdd')),
    intervalMs: base.intervalMs * Math.max(balance.minIntervalMul, 1 + sum('intervalPct')),
    eva: Math.min(balance.maxEva, base.eva + sum('evaAdd')),
    dmgTakenMul: base.dmgTakenMul * (1 + sum('dmgTakenPct')), kobanMul: base.kobanMul * (1 + sum('kobanPct')) }
}
