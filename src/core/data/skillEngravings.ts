import { jobs, type SkillDef } from './jobs.ts'
import type { JobId, Stats } from '../sim/types.ts'
export const engravingBalance = { chance: 0.2, effectMul: 1.5, cooldownMul: 1.3 } as const
export const skillEngravings = {
  focus: { parameter: 'mul', description: `集中の刻印：通常スキルの攻撃力参照部分${engravingBalance.effectMul}倍・待ち時間${engravingBalance.cooldownMul}倍` },
  duration: { parameter: 'ms', description: `持続の刻印：通常スキルの効果時間${engravingBalance.effectMul}倍・待ち時間${engravingBalance.cooldownMul}倍` },
} as const
export type SkillEngraving = keyof typeof skillEngravings
export function engravingCandidates(job: JobId): SkillEngraving[] {
  return (Object.keys(skillEngravings) as SkillEngraving[]).filter(id => jobs[job].skill.params[skillEngravings[id].parameter] > 0)
}
export function effectiveSkill(skill: SkillDef, stats: Pick<Stats, 'skillPowerMul' | 'skillDurationMul'>): SkillDef {
  const params = { ...skill.params }
  if (params.mul !== undefined) params.mul *= stats.skillPowerMul
  if (params.ms !== undefined) params.ms *= stats.skillDurationMul
  return { ...skill, params }
}
