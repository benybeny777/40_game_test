import { balance } from '../data/balance.ts'
import { jobs, partySize } from '../data/jobs.ts'
import type { JobId } from '../sim/types.ts'
import { experienceSupportMultiplier } from './experienceSupport.ts'

export interface FormationMember { job: JobId; lv: number }
type SkillKind = 'skill' | 'passive'
// Pair identities link the producer and consumer implemented in skills.ts/actions.ts.
// Skill names, descriptions, effects and level gates are read from their existing authorities.
const links = [
  { id: 'attention', source: 'gyaru', receiver: 'maid', kind: 'skill' },
  { id: 'ward', source: 'miko', receiver: 'bancho', kind: 'passive' },
  { id: 'slow', source: 'gariben', receiver: 'sukeban', kind: 'passive' },
] as const satisfies ReadonlyArray<{ id: string; source: JobId; receiver: JobId; kind: SkillKind }>

export function formationSupport(members: readonly FormationMember[]) {
  if (members.length !== partySize || new Set(members.map(member => member.job)).size !== partySize) throw new Error('Formation support requires three distinct companions')
  const veteran = Math.max(...members.map(member => member.lv))
  const synergies = links.flatMap(link => {
    const source = members.find(member => member.job === link.source), receiver = members.find(member => member.job === link.receiver)
    if (!source || !receiver) return []
    const requirements = [
      { job: source.job, skill: jobs[source.job].skill, level: source.lv, requiredLevel: balance.skillLv },
      { job: receiver.job, skill: jobs[receiver.job][link.kind], level: receiver.lv, requiredLevel: link.kind === 'skill' ? balance.skillLv : balance.passiveLv },
    ]
    return [{ id: link.id, requirements, ready: requirements.every(entry => entry.level >= entry.requiredLevel) }]
  })
  return { synergies, training: members.map(member => ({ ...member, multiplier: experienceSupportMultiplier(member.lv, veteran) })) }
}

export function previewReplacement(party: readonly FormationMember[], from: JobId, to: JobId) {
  const next = [...party], a = next.findIndex(member => member.job === from), b = next.findIndex(member => member.job === to)
  if (a < 0 || b < 0 || (a < partySize) === (b < partySize)) throw new Error('Replacement must exchange a deployed and reserve companion')
  ;[next[a], next[b]] = [next[b], next[a]]
  return { order: next.map(member => member.job), members: next.slice(0, partySize) }
}
