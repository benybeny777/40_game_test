import type { JobDef } from '../data/jobs.ts'
import { balance } from '../data/balance.ts'
import type { Stats, Effect } from './types.ts'
export function computeStats(job: JobDef, lv: number): Stats {
  // DESIGN §6.2 and detailed §7 disagree on CRI/EVA/LUK growth.
  // Until the policy is agreed, M1 guarantees only the unambiguous level-one stats.
  if (lv !== 1) throw new RangeError('Lv2以上の成長式はHANDOFF「要相談」で確認待ちです。M1は --lv 1 を使用してください')
  return { ...job.base }
}
export function withEffects(base: Stats, effects: readonly Effect[]): Stats {
  const sum = (kind: Effect['kind']) => effects.filter((effect) => effect.kind === kind).reduce((total, effect) => total + effect.value, 0)
  return { ...base, atk: base.atk * (1 + sum('atkPct')),
    intervalMs: base.intervalMs * Math.max(balance.minIntervalMul, 1 + sum('intervalPct')),
    eva: Math.min(balance.maxEva, base.eva + sum('evaAdd')),
    dmgTakenMul: base.dmgTakenMul * (1 + sum('dmgTakenPct')), kobanMul: base.kobanMul * (1 + sum('kobanPct')) }
}
