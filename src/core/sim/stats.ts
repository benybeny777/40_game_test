import type { JobDef } from '../data/jobs.ts'
import { balance } from '../data/balance.ts'
import { dojo as dojoDefs } from '../data/progress.ts'
import type { AffixKey } from '../data/items.ts'
import type { Stats, Effect, GearStats } from './types.ts'
export interface DojoLevels { atk?: number; hp?: number; walk?: number; drop?: number }
// HP/ATK/DEF grow multiplicatively, CRI/EVA/LUK additively (01-core.md §7).
// Gear: flat ATK/HP/DEF first, then % affixes, then dojo (03-progression-save.md §3).
export function computeStats(job: JobDef, lv: number, dojo: DojoLevels = {}, gear: readonly GearStats[] = []): Stats {
  if (!Number.isInteger(lv) || lv < 1 || lv > balance.maxLevel) throw new RangeError(`Lv must be 1..${balance.maxLevel}`)
  const n = lv - 1, g = job.growth, s = job.base
  const flat = (key: 'atk' | 'hp' | 'def') => gear.reduce((sum, item) => sum + item[key], 0)
  const affix = (key: AffixKey) => gear.reduce((sum, item) => sum + item.affixes.filter((entry) => entry.k === key).reduce((total, entry) => total + entry.v, 0), 0)
  return { ...s,
    maxHp: (s.maxHp * (1 + g.hp * n) + flat('hp')) * (1 + affix('hpPct')) * (1 + dojoDefs.hp.per * (dojo.hp ?? 0)),
    atk: (s.atk * (1 + g.atk * n) + flat('atk')) * (1 + affix('atkPct')) * (1 + dojoDefs.atk.per * (dojo.atk ?? 0)),
    def: (s.def * (1 + g.def * n) + flat('def')) * (1 + affix('defPct')),
    intervalMs: s.intervalMs * Math.max(balance.minIntervalMul, 1 + affix('intervalPct')),
    cri: s.cri + g.cri * n + affix('cri'), criMul: s.criMul + affix('criMul'),
    eva: Math.min(balance.maxEva, s.eva + g.eva * n + affix('eva')), luk: s.luk + g.luk * n + affix('luk'),
    kobanMul: 1 + affix('kobanPct'), dropMul: 1 + affix('dropPct'), cooldownMul: Math.max(balance.minIntervalMul, 1 + affix('cooldownPct')) }
}
export const sumEffects = (effects: readonly Effect[], kind: Effect['kind']) =>
  effects.filter((effect) => effect.kind === kind).reduce((total, effect) => total + effect.value, 0)
export function withEffects(base: Stats, effects: readonly Effect[]): Stats {
  const sum = (kind: Effect['kind']) => sumEffects(effects, kind)
  return { ...base, atk: base.atk * (1 + sum('atkPct')),
    intervalMs: base.intervalMs * Math.max(balance.minIntervalMul, 1 + sum('intervalPct')),
    eva: Math.min(balance.maxEva, base.eva + sum('evaAdd')),
    dmgTakenMul: base.dmgTakenMul * (1 + sum('dmgTakenPct')), kobanMul: base.kobanMul * (1 + sum('kobanPct')) }
}
