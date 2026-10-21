import type { JobDef } from '../data/jobs.ts'
import { balance } from '../data/balance.ts'
import { dojo as dojoDefs } from '../data/progress.ts'
import type { Stats, Effect } from './types.ts'
export interface DojoLevels { atk?: number; hp?: number; walk?: number }
// HP/ATK/DEF grow multiplicatively, CRI/EVA/LUK additively (01-core.md §7).
export function computeStats(job: JobDef, lv: number, dojo: DojoLevels = {}): Stats {
  if (!Number.isInteger(lv) || lv < 1 || lv > balance.maxLevel) throw new RangeError(`Lv must be 1..${balance.maxLevel}`)
  const n = lv - 1, g = job.growth, s = job.base
  return { ...s,
    maxHp: s.maxHp * (1 + g.hp * n) * (1 + dojoDefs.hp.per * (dojo.hp ?? 0)),
    atk: s.atk * (1 + g.atk * n) * (1 + dojoDefs.atk.per * (dojo.atk ?? 0)),
    def: s.def * (1 + g.def * n), cri: s.cri + g.cri * n, eva: s.eva + g.eva * n, luk: s.luk + g.luk * n }
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
