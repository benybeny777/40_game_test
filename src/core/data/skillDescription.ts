import type { SkillDef } from './jobs.ts'
import { realSeconds } from './timing.ts'

/** Duration comes from the effect parameter used by combat, not a second copy in prose. */
export function skillDescription(skill: SkillDef): string {
  if (!skill.desc.includes('{duration}')) return skill.desc
  const duration = skill.params.ms
  if (!Number.isFinite(duration) || duration < 0) throw new Error(`Missing skill duration: ${skill.id}`)
  return skill.desc.replaceAll('{duration}', String(realSeconds(duration)))
}
