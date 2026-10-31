import type { SkillDef } from './jobs.ts'
import { realSeconds } from './timing.ts'
/** Prose uses the same effective parameters as combat. */
export function skillDescription(skill: SkillDef): string {
  let description = skill.desc
  for (const [placeholder, parameter] of [['duration', 'ms'], ['power', 'mul']] as const) {
    if (!description.includes(`{${placeholder}}`)) continue
    const value = skill.params[parameter]
    if (!Number.isFinite(value) || value < 0) throw new Error(`Missing skill ${placeholder}: ${skill.id}`)
    const display = parameter === 'ms' ? realSeconds(value) : Math.round(value * 1000) / 1000
    description = description.replaceAll(`{${placeholder}}`, String(display))
  }
  return description
}
