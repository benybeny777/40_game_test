import { attributeDefs } from '../data/attributes.ts'
import type { ArmorClass } from '../data/itemNames.ts'
import { partyOrder } from '../data/jobs.ts'
import type { JobId } from '../sim/types.ts'
import type { Profile } from './profile.ts'
import { lootRank, rollItem, type Item } from './items.ts'
import { gearContribution } from '../sim/gearContribution.ts'

export interface SupplyTarget { job: JobId; slot: 'weapon' | 'armor' }
export function supplyArmorClass(job: JobId): ArmorClass {
  const main = attributeDefs[job].main
  return main === 'str' ? 'heavy' : main === 'int' ? 'robe' : 'light'
}
/** Compare the actual contribution to a same-floor common item, independently of HP/ATK units and job weapon scaling. */
function relativeStrength(item: Item, job: JobId, slot: SupplyTarget['slot'], rank: number) {
  // An isolated roll reuses the production formula without consuming profile RNG or duplicating growth/rarity math.
  const reference = rollItem({ rng: 1 }, 'supply-reference', { ilvl: rank, jobs: [job], slot,
    armorClass: supplyArmorClass(job), luk: 0, minRarity: 0, maxRarity: 0 })
  if (reference.baseRoll === undefined) throw new Error('Supply reference has no base roll')
  const expected = gearContribution(reference), actual = gearContribution(item)
  const ratio = (key: 'atk' | 'hp' | 'def') => actual[key] / (expected[key] / reference.baseRoll!)
  return slot === 'weapon' ? ratio('atk') : (ratio('hp') + ratio('def')) / 2
}
/** Empty slots first, then weakest normalized base contribution. Special effects are not a forced upgrade judgement. */
export function nextSupplyTarget(profile: Profile, activeJobs: readonly JobId[]): SupplyTarget | null {
  let target: SupplyTarget | null = null, weakest = Infinity
  const rank = lootRank(profile.progress.currentStage, profile.progress.depthRank)
  for (const job of partyOrder) if (activeJobs.includes(job)) {
    for (const slot of ['weapon', 'armor'] as const) {
      const id = profile.party.members[job].equip[slot]
      const item = id === null ? undefined : profile.inventory.find(candidate => candidate.id === id)
      if (id !== null && !item) throw new Error(`Missing equipped supply item: ${job}/${slot}/${id}`)
      const strength = item ? relativeStrength(item, job, slot, rank) : -1
      if (strength < weakest) { weakest = strength; target = { job, slot } }
    }
  }
  return target
}
