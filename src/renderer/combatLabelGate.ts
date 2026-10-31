import { jobs } from '../core/data/jobs'

const normalSkills = new Set(Object.values(jobs).map(job => job.skill.name))
export type CombatLabelKind = 'info' | 'combo' | 'loot'
const routine = (text: string, kind?: CombatLabelKind) => kind === 'info' || normalSkills.has(text)
/** Keep routine skill names from covering the fight; combos and finds are never throttled here. */
export function createCombatLabelGate() {
  const seen = new Map<string, number>()
  let lastRoutine = -Infinity
  return {
    routine,
    take(text: string, now: number, kind?: CombatLabelKind) {
      for (const [label, at] of seen) if (now - at >= 8000) seen.delete(label)
      if (!routine(text, kind)) return true
      if (now - lastRoutine < 3200 || now - (seen.get(text) ?? -Infinity) < 8000) return false
      seen.set(text, now); lastRoutine = now
      return true
    },
    clear() { seen.clear(); lastRoutine = -Infinity },
  }
}
