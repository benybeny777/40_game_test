import { attributeBalance, attributeKeys, type Attributes } from '../data/attributes.ts'
import { balance } from '../data/balance.ts'
import { dungeons } from '../data/dungeon.ts'
import { slots, type SlotId } from '../data/items.ts'
import { jobs, partySize } from '../data/jobs.ts'
import type { JobId } from '../sim/types.ts'
import type { Profile } from './profile.ts'

export const ABYSS_HISTORY_LIMIT = 8
const initialGoals = [100, 250, 500, 1000]
export interface AbyssMember { job: JobId; lv: number; allocated: Attributes; equipment: Record<SlotId, string | null> }
export interface AbyssClear { floor: number; party: AbyssMember[] }
export interface AbyssRecord { best: AbyssClear | null; milestones: AbyssClear[] }
export interface AbyssView extends AbyssRecord { nextGoal: number | null }
export function nextAbyssGoal(cleared: number): number | null {
  const next = initialGoals.find(floor => floor > cleared) ?? (Math.floor(cleared / 1000) + 1) * 1000
  return Number.isSafeInteger(next) ? next : null
}
const isMilestone = (floor: number) => initialGoals.includes(floor) || floor >= 1000 && floor % 1000 === 0
export function abyssView(profile: Profile): AbyssView {
  const record = profile.abyssRecords[profile.dungeonId] ?? { best: null, milestones: [] }
  return { ...structuredClone(record), nextGoal: nextAbyssGoal(record.best?.floor ?? 0) }
}
/** Called before rewards mutate equipment/levels, using units that actually won this battle. */
export function recordAbyssClear(profile: Profile, floor: number, activeJobs: JobId[]): void {
  const record = profile.abyssRecords[profile.dungeonId] ??= { best: null, milestones: [] }
  if (record.best && floor <= record.best.floor) return
  const clear: AbyssClear = { floor, party: activeJobs.map(job => {
    const member = profile.party.members[job]
    return { job, lv: member.lv, allocated: { ...member.allocated }, equipment: Object.fromEntries(
      (Object.keys(slots) as SlotId[]).map(slot => {
        const id = member.equip[slot], item = id === null ? null : profile.inventory.find(item => item.id === id)
        if (id !== null && !item) throw new Error('Missing equipped item in abyss record')
        return [slot, item?.name ?? null]
      })) as AbyssMember['equipment'] }
  }) }
  record.best = clear
  if (isMilestone(floor)) record.milestones = [...record.milestones, structuredClone(clear)].slice(-ABYSS_HISTORY_LIMIT)
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
function validClear(value: unknown): value is AbyssClear {
  if (!object(value) || !integer(value.floor, 1) || !Array.isArray(value.party) || value.party.length !== partySize) return false
  const seen = new Set<string>()
  return value.party.every(member => {
    if (!object(member) || typeof member.job !== 'string' || !Object.hasOwn(jobs, member.job) || seen.has(member.job)
      || !integer(member.lv, 1, balance.maxLevel) || !object(member.allocated) || !object(member.equipment)) return false
    seen.add(member.job)
    const allocated = member.allocated, equipment = member.equipment
    return attributeKeys.every(key => integer(allocated[key], 0))
      && attributeKeys.reduce((sum, key) => sum + (allocated[key] as number), 0) <= (member.lv - 1) * attributeBalance.pointsPerLevel
      && Object.keys(slots).every(slot => equipment[slot] === null || typeof equipment[slot] === 'string' && equipment[slot].length > 0 && equipment[slot].length <= 256)
  })
}
/** Only an absent extension means a pre-recording save; malformed present data is never discarded. */
export function validateAbyssRecords(raw: unknown): Record<string, AbyssRecord> {
  if (raw === undefined) return {}
  if (!object(raw) || Object.keys(raw).some(id => !Object.hasOwn(dungeons, id))) throw new Error('bad abyss records')
  for (const record of Object.values(raw)) {
    if (!object(record) || !(record.best === null || validClear(record.best)) || !Array.isArray(record.milestones)
      || record.milestones.length > ABYSS_HISTORY_LIMIT) throw new Error('bad abyss records')
    let previous = 0
    for (const clear of record.milestones) {
      if (!validClear(clear) || !isMilestone(clear.floor) || clear.floor <= previous || record.best === null || clear.floor > (record.best as AbyssClear).floor) throw new Error('bad abyss records')
      previous = clear.floor
    }
  }
  return structuredClone(raw) as Record<string, AbyssRecord>
}
