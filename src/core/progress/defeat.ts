import { balance } from '../data/balance.ts'
import { cappedAmount, dungeons, maxFloor, type Difficulty, type DungeonId } from '../data/dungeon.ts'
import { enemies } from '../data/enemies.ts'
import { jobs, partySize } from '../data/jobs.ts'
import type { JobId, SimEvent, World } from '../sim/types.ts'
import type { Profile } from './profile.ts'

export interface DefeatSource { enemyId: string; skillId: string | null }
export interface DefeatMember {
  job: JobId; lv: number
  /** Actual HP lost in the defeated wave, including damage before any revival. */
  damageTaken: number
  /** Final death tick order; simultaneous deaths share a rank. Null means unobserved. */
  fallOrder: number | null
  /** Last positive enemy damage in the death tick; null when attribution is unavailable. */
  fatalSource: DefeatSource | null
}
export interface DefeatRecord { dungeonId: DungeonId; floor: number; depthRank: Difficulty; wave: number; party: DefeatMember[] }
/** Proves that this floor has been cleared; it does not claim the clear happened after the defeat. */
export function lastDefeatResolved(profile: Profile): boolean {
  const record = profile.lastDefeat
  if (!record) return false
  const progress = record.dungeonId === profile.dungeonId ? profile.progress : profile.dungeonRecords[record.dungeonId]
  if (progress !== undefined) {
    if (!progress || !Array.isArray(progress.unlockedDepths) || progress.unlockedDepths.length !== 3
      || !progress.unlockedDepths.every((floor, rank) => Number.isSafeInteger(floor) && floor >= (rank === 0 ? 1 : 0) && floor <= maxFloor(rank as Difficulty))) throw new Error('bad recorded dungeon progress')
    if ((progress.unlockedDepths[1] > 0 && progress.unlockedDepths[0] < maxFloor(0))
      || (progress.unlockedDepths[2] > 0 && progress.unlockedDepths[1] < maxFloor(1))) throw new Error('bad recorded dungeon progress')
    if (progress.unlockedDepths[record.depthRank] > record.floor) return true
    if (record.depthRank < 2 && record.floor === maxFloor(record.depthRank) && progress.unlockedDepths[record.depthRank + 1] > 0) return true
  }
  return record.depthRank === 2 && (profile.abyssRecords[record.dungeonId]?.best?.floor ?? 0) >= record.floor
}
interface MemberTrace { damageTaken: number; fallTick: number | null; fatalSource: DefeatSource | null }

/** Bounded current-wave trace; only the last completed defeat is persisted. */
export class DefeatTracker {
  private readonly members = new Map<number, MemberTrace>()
  observe(profile: Profile, world: World, events: readonly SimEvent[]): void {
    const lethalCandidates = new Map<number, DefeatSource | null>()
    for (const event of events) {
      if (event.t === 'phase' && (event.phase === 'walking' || event.phase === 'town')) {
        this.members.clear(); lethalCandidates.clear()
      }
      if (event.t === 'damage' || event.t === 'death' || event.t === 'revive') {
        const unit = world.units.find(unit => unit.uid === event.uid && unit.side === 'ally')
        if (!unit) continue
        let member = this.members.get(unit.uid)
        if (!member) { member = { damageTaken: 0, fallTick: null, fatalSource: null }; this.members.set(unit.uid, member) }
        if (event.t === 'damage' && event.amount > 0) {
          member.damageTaken = cappedAmount(member.damageTaken + event.amount)
          const source = world.units.find(unit => unit.uid === event.sourceUid && unit.side === 'enemy')
          const enemy = source && enemies[source.defId]
          const skillId = enemy?.boss?.skill?.id
          lethalCandidates.set(unit.uid, source && enemy ? { enemyId: source.defId,
            skillId: skillId && event.tags?.includes(skillId) ? skillId : enemy.traits.explode && event.tags?.includes('explode') ? 'explode' : null } : null)
        } else if (event.t === 'death') {
          member.fallTick = world.tick; member.fatalSource = lethalCandidates.get(unit.uid) ?? null
        } else if (event.t === 'revive') {
          member.fallTick = null; member.fatalSource = null; lethalCandidates.delete(unit.uid)
        }
      }
      if (event.t === 'phase' && event.phase === 'wipe') {
        const allies = world.units.filter(unit => unit.side === 'ally')
        const deathTicks = [...new Set(allies.flatMap(unit => {
          const tick = this.members.get(unit.uid)?.fallTick
          return tick === undefined || tick === null ? [] : [tick]
        }))].sort((a, b) => a - b)
        profile.lastDefeat = { dungeonId: profile.dungeonId, floor: event.stageNo, depthRank: event.depthRank ?? world.depthRank, wave: event.wave,
          party: allies.map(unit => {
            const member = this.members.get(unit.uid)
            return { job: unit.defId as JobId, lv: unit.lv, damageTaken: member?.damageTaken ?? 0,
              fallOrder: member?.fallTick === undefined || member.fallTick === null ? null : deathTicks.indexOf(member.fallTick) + 1,
              fatalSource: member?.fatalSource ? { ...member.fatalSource } : null }
          }) }
      }
    }
  }
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
export function validateDefeatRecord(raw: unknown): DefeatRecord | null {
  if (raw === undefined || raw === null) return null // Explicit absence, including saves predating the feature.
  const fail = (field: string, reason: string): never => { throw new Error(`bad defeat record: ${field} ${reason}`) }
  if (!object(raw)) return fail('lastDefeat', 'must be an object or null')
  if (typeof raw.dungeonId !== 'string' || !Object.hasOwn(dungeons, raw.dungeonId)) return fail('dungeonId', 'must identify a supported dungeon')
  if (!integer(raw.depthRank, 0, 2)) return fail('depthRank', 'must be an integer from 0 to 2')
  if (!integer(raw.floor, 1, maxFloor(raw.depthRank as Difficulty))) return fail('floor', 'is outside the recorded difficulty')
  if (!integer(raw.wave, 1, balance.waves)) return fail('wave', `must be an integer from 1 to ${balance.waves}`)
  if (!Array.isArray(raw.party) || raw.party.length !== partySize) return fail('party', `must contain exactly ${partySize} members`)
  const seen = new Set<string>(), ranks = new Set<number>(), party: DefeatMember[] = []
  for (const [index, member] of raw.party.entries()) {
    const path = `party[${index}]`
    if (!object(member)) return fail(path, 'must be an object')
    if (typeof member.job !== 'string' || !Object.hasOwn(jobs, member.job)) return fail(`${path}.job`, 'must identify a supported job')
    if (seen.has(member.job)) return fail(`${path}.job`, 'duplicates another member')
    if (!integer(member.lv, 1, balance.maxLevel)) return fail(`${path}.lv`, `must be an integer from 1 to ${balance.maxLevel}`)
    if (typeof member.damageTaken !== 'number' || !Number.isFinite(member.damageTaken) || member.damageTaken < 0 || member.damageTaken > Number.MAX_SAFE_INTEGER) return fail(`${path}.damageTaken`, 'must be a finite nonnegative supported amount')
    if (!(member.fallOrder === null || integer(member.fallOrder, 1, partySize))) return fail(`${path}.fallOrder`, `must be null or an integer from 1 to ${partySize}`)
    seen.add(member.job)
    if (member.fallOrder !== null) ranks.add(member.fallOrder)
    let fatalSource: DefeatSource | null = null
    if (member.fatalSource !== null) {
      const source = member.fatalSource
      if (!object(source)) return fail(`${path}.fatalSource`, 'must be an object or null')
      if (member.fallOrder === null) return fail(`${path}.fatalSource`, 'requires an observed fallOrder')
      if (typeof source.enemyId !== 'string' || !Object.hasOwn(enemies, source.enemyId)) return fail(`${path}.fatalSource.enemyId`, 'must identify a supported enemy')
      const enemy = enemies[source.enemyId]
      if (!(source.skillId === null || typeof source.skillId === 'string' && (source.skillId === enemy.boss?.skill?.id || source.skillId === 'explode' && enemy.traits.explode))) return fail(`${path}.fatalSource.skillId`, 'must be null or a skill belonging to the recorded enemy')
      fatalSource = { enemyId: source.enemyId, skillId: source.skillId as string | null }
    }
    party.push({ job: member.job as JobId, lv: member.lv, damageTaken: member.damageTaken, fallOrder: member.fallOrder, fatalSource })
  }
  if ([...ranks].sort((a, b) => a - b).some((rank, index) => rank !== index + 1)) return fail('party.fallOrder', 'must form consecutive ranks starting at 1; ties are allowed')
  // Retain the validated schema only; forward extension keys are not trusted save payload.
  return { dungeonId: raw.dungeonId as DungeonId, floor: raw.floor, depthRank: raw.depthRank as Difficulty, wave: raw.wave, party }
}
