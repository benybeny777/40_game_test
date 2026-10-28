import { attributeBalance, attributeDefs, attributeKeys, emptyAttributes, type Attributes } from '../data/attributes.ts'
import type { JobId } from '../sim/types.ts'
import type { Member } from './profile.ts'
export const availablePoints = (member: Member) => Math.max(0, attributeBalance.pointsPerLevel * (member.lv - 1) - attributeKeys.reduce((sum, key) => sum + member.allocated[key], 0))
export const attributesOf = (job: JobId, allocated: Attributes): Attributes => Object.fromEntries(attributeKeys.map((key) => [key, attributeDefs[job].base[key] + allocated[key]])) as Attributes
export function spendAuto(member: Member, job: JobId) {
  if (!member.autoStats) return
  const weights = attributeDefs[job].auto, weight = attributeKeys.reduce((sum, key) => sum + weights[key], 0)
  let allocated = attributeKeys.reduce((sum, key) => sum + member.allocated[key], 0)
  const points = availablePoints(member)
  for (let point = 0; point < points; point++) {
    const key = attributeKeys.reduce((best, candidate) => (allocated + 1) * weights[candidate] / weight - member.allocated[candidate]
      > (allocated + 1) * weights[best] / weight - member.allocated[best] ? candidate : best)
    member.allocated[key]++; allocated++
  }
}
export const resetAllocation = (member: Member) => { member.allocated = emptyAttributes(); member.autoStats = false }
