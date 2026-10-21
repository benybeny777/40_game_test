import { balance as b } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { partyOrder } from '../data/jobs.ts'
import { dojo as dojoDefs, progressBalance as pb, type DojoKey } from '../data/progress.ts'
import type { JobId, SimEvent } from '../sim/types.ts'

export const PROFILE_VERSION = 1
export interface Gain { koban: number; exp: number }
export interface OfflineResult { ms: number; koban: number; exp: number }
export interface Profile {
  version: number
  savedAt: string                                   // Written by main; core never reads the clock.
  progress: { unlockedStage: number; currentStage: number; loop: boolean }
  party: { order: JobId[]; members: Record<JobId, { lv: number; exp: number }> }
  koban: number
  dojo: Record<DojoKey, number>
  stats: { kills: number; wipes: number; bossKills: number; stageClears: number; playMs: number; totalKoban: number }
  rates: { current: Gain; minutes: Gain[] }        // Last 10 closed minutes, for offline rewards.
  seenEnemies: string[]
  pendingOffline: OfflineResult | null
}
export function newProfile(savedAt: string): Profile {
  return { version: PROFILE_VERSION, savedAt,
    progress: { unlockedStage: 1, currentStage: 1, loop: false },
    party: { order: [...partyOrder], members: Object.fromEntries(partyOrder.map((id) => [id, { lv: 1, exp: 0 }])) as Profile['party']['members'] },
    koban: 0, dojo: { atk: 0, hp: 0, walk: 0 },
    stats: { kills: 0, wipes: 0, bossKills: 0, stageClears: 0, playMs: 0, totalKoban: 0 },
    rates: { current: { koban: 0, exp: 0 }, minutes: [] }, seenEnemies: [], pendingOffline: null }
}
export const expToNext = (lv: number) => Math.floor(b.expBase * lv ** b.expPow)
export const levels = (profile: Profile) => Object.fromEntries(partyOrder.map((id) => [id, profile.party.members[id].lv])) as Record<JobId, number>

function grantExp(profile: Profile, exp: number, out: SimEvent[]) {
  for (const job of partyOrder) {
    const member = profile.party.members[job]
    if (member.lv >= b.maxLevel) continue
    member.exp += exp
    while (member.lv < b.maxLevel && member.exp >= expToNext(member.lv)) {
      member.exp -= expToNext(member.lv); member.lv++
      out.push({ t: 'levelUp', job, lv: member.lv })
    }
    if (member.lv >= b.maxLevel) member.exp = 0
  }
}
export function addKoban(profile: Profile, koban: number) { profile.koban += koban; profile.stats.totalKoban += koban }

/** Applies one tick of simulation events. Returns derived events (levelUp) and what changed. */
export function applyRewards(profile: Profile, events: readonly SimEvent[]) {
  const out: SimEvent[] = []
  let changed = false, stageCleared = false
  for (const event of events) {
    if (event.t === 'reward') {
      addKoban(profile, event.koban)
      if (event.exp) grantExp(profile, event.exp, out)
      profile.rates.current.koban += event.koban; profile.rates.current.exp += event.exp
      if (enemies[event.enemyId]) {
        profile.stats.kills++
        if (enemies[event.enemyId].boss) profile.stats.bossKills++
        if (!profile.seenEnemies.includes(event.enemyId)) profile.seenEnemies.push(event.enemyId)
      }
      changed = true
    } else if (event.t === 'phase') {
      profile.progress.currentStage = event.stageNo
      if (event.phase === 'stageClear') {
        profile.stats.stageClears++; stageCleared = true
        profile.progress.unlockedStage = Math.min(b.maxStage, Math.max(profile.progress.unlockedStage, event.stageNo + 1))
      }
      if (event.phase === 'wipe') profile.stats.wipes++
      changed = true
    }
  }
  return { events: out, changed, levelsChanged: out.length > 0, stageCleared }
}
export function closeMinute(profile: Profile) {
  profile.rates.minutes.push(profile.rates.current)
  profile.rates.minutes = profile.rates.minutes.slice(-pb.rateMinutes)
  profile.rates.current = { koban: 0, exp: 0 }
}
export function perMinute(profile: Profile): Gain {
  const minutes = profile.rates.minutes
  if (!minutes.length) return { koban: 0, exp: 0 }
  return { koban: minutes.reduce((sum, gain) => sum + gain.koban, 0) / minutes.length, exp: minutes.reduce((sum, gain) => sum + gain.exp, 0) / minutes.length }
}
/** Offline rewards: average of the last closed minutes × elapsed minutes × 0.5, capped at 8 hours. */
export function computeOffline(profile: Profile, elapsedMs: number): OfflineResult | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < pb.offlineMinMs) return null
  const ms = Math.min(elapsedMs, pb.offlineMaxMs)
  const rate = perMinute(profile), minutes = ms / pb.minuteMs
  const result = { ms, koban: Math.floor(rate.koban * minutes * pb.offlineRate), exp: Math.floor(rate.exp * minutes * pb.offlineRate) }
  return result.koban || result.exp ? result : null
}
export function addOffline(profile: Profile, result: OfflineResult) {
  const pending = profile.pendingOffline
  profile.pendingOffline = pending ? { ms: pending.ms + result.ms, koban: pending.koban + result.koban, exp: pending.exp + result.exp } : result
}
export function claimOffline(profile: Profile): SimEvent[] {
  const pending = profile.pendingOffline, out: SimEvent[] = []
  if (!pending) return out
  addKoban(profile, pending.koban); grantExp(profile, pending.exp, out)
  profile.pendingOffline = null
  return out
}
export const dojoCost = (key: DojoKey, level: number) => Math.floor(dojoDefs[key].cost * pb.dojoCostGrowth ** level)
export function buyDojo(profile: Profile, key: DojoKey): { ok: true } | { ok: false; reason: string } {
  const def = dojoDefs[key]
  if (!def) return { ok: false, reason: '不明な強化です' }
  const level = profile.dojo[key]
  if (def.max !== null && level >= def.max) return { ok: false, reason: 'これ以上は強化できません' }
  const cost = dojoCost(key, level)
  if (profile.koban < cost) return { ok: false, reason: '小判が足りません' }
  profile.koban -= cost; profile.dojo[key] = level + 1
  return { ok: true }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
/** Throws on anything that could corrupt progression. Missing optional fields are filled from a new profile. */
export function validateProfile(raw: unknown): Profile {
  if (!isObject(raw) || raw.version !== PROFILE_VERSION) throw new Error('unsupported save version')
  const fresh = newProfile(typeof raw.savedAt === 'string' ? raw.savedAt : '')
  const progress = raw.progress, party = raw.party, dojo = raw.dojo
  if (!isObject(progress) || !count(progress.unlockedStage, 1, b.maxStage) || !count(progress.currentStage, 1, b.maxStage)) throw new Error('bad progress')
  if (!isObject(party) || !Array.isArray(party.order) || party.order.length !== partyOrder.length || !partyOrder.every((id) => (party.order as unknown[]).includes(id))) throw new Error('bad party order')
  if (!isObject(party.members)) throw new Error('bad members')
  for (const id of partyOrder) {
    const member = (party.members as Record<string, unknown>)[id]
    if (!isObject(member) || !Number.isInteger(member.lv) || !count(member.lv, 1, b.maxLevel) || !count(member.exp)) throw new Error(`bad member ${id}`)
  }
  if (!count(raw.koban)) throw new Error('bad koban')
  if (!isObject(dojo) || !Object.keys(dojoDefs).every((key) => count(dojo[key] ?? 0, 0, dojoDefs[key as DojoKey].max ?? Number.MAX_SAFE_INTEGER))) throw new Error('bad dojo')
  const profile = { ...fresh, ...raw } as Profile
  profile.dojo = { ...fresh.dojo, ...(dojo as Profile['dojo']) }
  profile.stats = { ...fresh.stats, ...(isObject(raw.stats) ? raw.stats as Profile['stats'] : {}) }
  profile.rates = isObject(raw.rates) && Array.isArray(raw.rates.minutes) ? raw.rates as Profile['rates'] : fresh.rates
  profile.progress = { ...fresh.progress, ...(progress as Profile['progress']), loop: progress.loop === true }
  profile.progress.currentStage = Math.min(profile.progress.currentStage, profile.progress.unlockedStage)
  profile.seenEnemies = Array.isArray(raw.seenEnemies) ? raw.seenEnemies.filter((id): id is string => typeof id === 'string' && id in enemies) : []
  profile.pendingOffline = isObject(raw.pendingOffline) && count(raw.pendingOffline.koban) && count(raw.pendingOffline.exp) && count(raw.pendingOffline.ms)
    ? raw.pendingOffline as unknown as OfflineResult : null
  return profile
}
