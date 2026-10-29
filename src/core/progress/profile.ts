import { attributeBalance, attributeKeys, emptyAttributes, type Attributes } from '../data/attributes.ts'
import { spendAuto } from './attributes.ts'
import { balance as b } from '../data/balance.ts'
import { cappedAmount, dungeons, maxFloor, type Difficulty, type DungeonId } from '../data/dungeon.ts'
import { enemies } from '../data/enemies.ts'
import { affixes, itemBalance as ib, rarities, slots, uniqueDefs, type Rarity, type SlotId } from '../data/items.ts'
import { defaultFormation, deployedJobs, jobs, partyOrder } from '../data/jobs.ts'
import { dojo as dojoDefs, progressBalance as pb, type DojoKey } from '../data/progress.ts'
import type { JobId, SimEvent } from '../sim/types.ts'
import { dropChance, lootRank, partyLuk, receiveItem, reconcileEquipment, requirementsOf, rollItem, type Item } from './items.ts'
import { random } from '../sim/rng.ts'
import { validateAbyssRecords, type AbyssRecord } from './abyss.ts'

export const PROFILE_VERSION = 3
export interface Gain { koban: number; exp: number }
export interface OfflineResult { ms: number; koban: number; exp: number; items?: number; expByJob?: Partial<Record<JobId, number>> }
export interface Member { lv: number; exp: number; allocated: Attributes; autoStats: boolean; equip: Record<SlotId, string | null> }
export interface DungeonProgress { unlockedStage: number; currentStage: number; loop: boolean; inTown: boolean; depthRank: Difficulty; unlockedDepths: [number, number, number]; eventDepths: [number, number, number] }
export interface Profile {
  version: number
  savedAt: string                                   // Written by main; core never reads the clock.
  rng: number                                       // Drop stream, separate from the battle RNG.
  progress: DungeonProgress
  dungeonId: DungeonId
  dungeonSeed: number
  dungeonRecords: Record<string, DungeonProgress>
  abyssRecords: Record<string, AbyssRecord>
  party: { order: JobId[]; members: Record<JobId, Member> }
  koban: number
  dojo: Record<DojoKey, number>
  inventory: Item[]                                 // Equipped items included.
  nextItemId: number
  options: { autoSellMaxRarity: Rarity | null; autoEquip: boolean }
  stats: { kills: number; wipes: number; bossKills: number; stageClears: number; playMs: number; totalKoban: number; drops: number }
  rates: { current: Gain; minutes: Gain[]; elapsedMs: number; legacyUnmeasuredGain: Gain | null } // Real minute clock is saved with its earnings.
  seenEnemies: string[]
  seenItems: string[]
  offlineJobs: JobId[]                              // Actually deployed, not a queued formation change.
  pendingOffline: OfflineResult | null
}
const emptyEquip = (): Record<SlotId, string | null> => ({ weapon: null, armor: null, charm: null })
export function newProfile(savedAt: string, seed = 1): Profile {
  const progress: DungeonProgress = { unlockedStage: 1, currentStage: 1, loop: false, inTown: false, depthRank: 0, unlockedDepths: [1, 0, 0], eventDepths: [0, 0, 0] }
  return { version: PROFILE_VERSION, savedAt, rng: seed >>> 0,
    progress, dungeonId: 'yomi', dungeonSeed: seed >>> 0, dungeonRecords: { yomi: progress }, abyssRecords: {},
    party: { order: [...defaultFormation], members: Object.fromEntries(partyOrder.map((id) => [id, { lv: 1, exp: 0, allocated: emptyAttributes(), autoStats: true, equip: emptyEquip() }])) as Profile['party']['members'] },
    koban: 0, dojo: { atk: 0, hp: 0, walk: 0, drop: 0, offline: 0 }, inventory: [], nextItemId: 1,
    options: { autoSellMaxRarity: null, autoEquip: true },
    stats: { kills: 0, wipes: 0, bossKills: 0, stageClears: 0, playMs: 0, totalKoban: 0, drops: 0 },
    rates: { current: { koban: 0, exp: 0 }, minutes: [], elapsedMs: 0, legacyUnmeasuredGain: null }, seenEnemies: [], seenItems: [], offlineJobs: deployedJobs(defaultFormation), pendingOffline: null }
}
export const expToNext = (lv: number) => Math.floor(b.expBase * lv ** b.expPow)
export const levels = (profile: Profile) => Object.fromEntries(partyOrder.map((id) => [id, profile.party.members[id].lv])) as Record<JobId, number>

/** Active mentorship only: the bonus closes a gap, never overtakes the participating veteran. */
export function activeExperienceMultiplier(profile: Profile, job: JobId, recipientJobs: readonly JobId[]): number {
  const member = profile.party.members[job]
  if (!recipientJobs.includes(job) || member.lv >= b.maxLevel) return 1
  const veteranLevel = Math.max(1, ...recipientJobs.map((id) => profile.party.members[id].lv))
  return Math.min(pb.catchupMaxMultiplier, 1 + Math.max(0, veteranLevel - pb.catchupLevelGap - member.lv) * pb.catchupPerLevel)
}
function catchupExperience(member: Member, exp: number, veteranLevel: number, multiplier: number) {
  const targetLevel = veteranLevel - pb.catchupLevelGap
  if (member.lv >= targetLevel) return exp
  let needed = -member.exp
  for (let level = member.lv; level < targetLevel; level++) needed += expToNext(level)
  return exp + Math.min(Math.floor(exp * (multiplier - 1)), Math.max(0, needed - exp))
}
function grantExp(profile: Profile, exp: number, out: SimEvent[], recipientJobs: readonly JobId[], live = false) {
  // Snapshot before awarding so party order cannot change the bonus.
  const veteranLevel = Math.max(1, ...recipientJobs.map((job) => profile.party.members[job].lv))
  const multipliers = new Map(recipientJobs.map((job) => [job, live ? activeExperienceMultiplier(profile, job, recipientJobs) : 1]))
  for (const job of new Set(recipientJobs)) {
    const member = profile.party.members[job]
    if (member.lv >= b.maxLevel) continue
    member.exp += live ? catchupExperience(member, exp, veteranLevel, multipliers.get(job)!) : exp
    while (member.lv < b.maxLevel && member.exp >= expToNext(member.lv)) {
      member.exp -= expToNext(member.lv); member.lv++
      out.push({ t: 'levelUp', job, lv: member.lv })
    }
    if (member.lv >= b.maxLevel) member.exp = 0
    spendAuto(member, job)
  }
}
export function addKoban(profile: Profile, koban: number) { profile.koban = cappedAmount(profile.koban + koban); profile.stats.totalKoban = cappedAmount(profile.stats.totalKoban + koban) }

/** Rolls and stores one item; emits a 'drop' event for the strip. */
export function dropItem(profile: Profile, floor: number, x: number, out: SimEvent[], range: { min?: Rarity; max?: Rarity; slot?: SlotId; job?: JobId; holdForReview?: boolean; difficulty?: Difficulty } = {}, activeJobs = deployedJobs(profile.party.order)) {
  if (!Number.isSafeInteger(profile.nextItemId) || profile.nextItemId >= Number.MAX_SAFE_INTEGER - 1) throw new RangeError('item id sequence exhausted')
  const item = rollItem(profile, `i${profile.nextItemId++}`, { ilvl: lootRank(floor, range.difficulty ?? profile.progress.depthRank), luk: partyLuk(profile, activeJobs), jobs: range.job ? [range.job] : partyOrder,
    activeJobs, slot: range.slot, minRarity: range.min, maxRarity: range.max })
  const kind = `${item.slot}:${item.job ?? ''}:${item.name}`
  if (!profile.seenItems.includes(kind)) profile.seenItems.push(kind)
  profile.stats.drops++
  const result = receiveItem(profile, item, range.holdForReview, activeJobs)
  out.push({ t: 'drop', x, rarity: item.rarity, name: item.name, equippedBy: result.equippedBy, sold: result.sold,
    ...(result.sale ? { sale: { reason: result.sale.reason, name: result.sale.item.name, rarity: result.sale.item.rarity, koban: result.sale.koban } } : {}) })
  return result
}

/** Applies one tick of simulation events. Returns derived events (levelUp, drop) and what changed. */
export function applyRewards(profile: Profile, events: readonly SimEvent[], activeJobs = deployedJobs(profile.party.order)) {
  const out: SimEvent[] = []
  let changed = false, stageCleared = false, gearChanged = false
  for (const event of events) {
    if (event.t === 'reward') {
      addKoban(profile, event.koban)
      if (event.exp) grantExp(profile, event.exp, out, activeJobs, true)
      profile.rates.current.koban = cappedAmount(profile.rates.current.koban + event.koban); profile.rates.current.exp = cappedAmount(profile.rates.current.exp + event.exp)
      const enemy = enemies[event.enemyId]
      if (enemy) {
        profile.stats.kills++
        if (enemy.boss) profile.stats.bossKills++
        if (!profile.seenEnemies.includes(event.enemyId)) profile.seenEnemies.push(event.enemyId)
        if (random(profile) < dropChance(profile, Boolean(enemy.boss), activeJobs)) {
          const result = dropItem(profile, event.stageNo ?? profile.progress.currentStage, event.x, out, enemy.boss ? { min: ib.bossMinRarity } : {}, activeJobs)
          if (result.equippedBy) gearChanged = true
        }
      }
      changed = true
    } else if (event.t === 'floorEvent') {
      profile.progress.eventDepths[event.depthRank] = Math.max(profile.progress.eventDepths[event.depthRank], event.stageNo)
      if (event.kind === 'treasure') { const result = dropItem(profile, event.stageNo, 0, out, { min: 1, difficulty: event.depthRank }, activeJobs); gearChanged ||= Boolean(result.equippedBy) }
      changed = true
    } else if (event.t === 'phase') {
      const rank = event.depthRank ?? profile.progress.depthRank
      profile.progress.depthRank = rank
      profile.progress.inTown = event.phase === 'town'
      profile.progress.currentStage = event.stageNo
      profile.progress.unlockedStage = profile.progress.unlockedDepths[rank]
      if (event.phase === 'stageClear') {
        const firstClear = event.stageNo >= profile.progress.unlockedDepths[rank]
          && (rank === 2 ? event.stageNo < Number.MAX_SAFE_INTEGER : event.stageNo < maxFloor(rank) || profile.progress.unlockedDepths[(rank + 1) as Difficulty] === 0)
        if (firstClear && rank === 0 && event.stageNo === 1) {
          const job = activeJobs.find(id => !profile.party.members[id].equip.weapon) ?? activeJobs[0]
          dropItem(profile, 1, 0, out, { min: 1, max: 1, slot: 'weapon', job, holdForReview: true, difficulty: rank }, activeJobs)
        } else if (firstClear && event.stageNo % 10 === 0) {
          const result = dropItem(profile, event.stageNo, 0, out, { min: event.stageNo % 100 === 0 ? 4 : 3, holdForReview: true, difficulty: rank }, activeJobs)
          gearChanged ||= Boolean(result.equippedBy)
        }
        profile.stats.stageClears++; stageCleared = true
        profile.progress.unlockedDepths[rank] = Math.min(maxFloor(rank), Math.max(profile.progress.unlockedDepths[rank], event.stageNo + 1))
        profile.progress.unlockedStage = profile.progress.unlockedDepths[rank]
        if (rank < 2 && event.stageNo >= maxFloor(rank)) profile.progress.unlockedDepths[(rank + 1) as Difficulty] = Math.max(1, profile.progress.unlockedDepths[(rank + 1) as Difficulty])
      }
      if (event.phase === 'wipe') profile.stats.wipes++
      changed = true
    }
  }
  return { events: out, changed, levelsChanged: out.some((event) => event.t === 'levelUp') || gearChanged, stageCleared }
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
const offlineRecipients = (profile: Profile) => [...(profile.offlineJobs ?? deployedJobs(profile.party.order))]
function withOfflineRecipients(profile: Profile, result: OfflineResult): OfflineResult {
  return { ...result, expByJob: result.expByJob ? { ...result.expByJob }
    : Object.fromEntries(offlineRecipients(profile).map(job => [job, result.exp])) }
}
/** Upgrade a legacy pending reward before a formation edit can change its recipients. */
export function freezePendingOffline(profile: Profile) {
  if (profile.pendingOffline && !profile.pendingOffline.expByJob) profile.pendingOffline = withOfflineRecipients(profile, profile.pendingOffline)
}

/** Offline rewards: average × elapsed minutes × 0.5, capped at 8 hours plus dojo; one 並/上 roll per 10 minutes. */
export function computeOffline(profile: Profile, elapsedMs: number): OfflineResult | null {
  if (profile.progress.inTown) return null
  if (!Number.isFinite(elapsedMs) || elapsedMs < pb.offlineMinMs) return null
  const ms = Math.min(elapsedMs, pb.offlineMaxMs + dojoDefs.offline.per * profile.dojo.offline)
  const rate = perMinute(profile), minutes = ms / pb.minuteMs
  const result = { ms, koban: Math.floor(cappedAmount(rate.koban * minutes * pb.offlineRate)), exp: Math.floor(cappedAmount(rate.exp * minutes * pb.offlineRate)),
    items: rate.koban ? Math.floor(ms / ib.offlineDropEveryMs) : 0 }
  return result.koban || result.exp ? withOfflineRecipients(profile, result) : null
}
export function addOffline(profile: Profile, result: OfflineResult) {
  freezePendingOffline(profile)
  const incoming = withOfflineRecipients(profile, result), pending = profile.pendingOffline
  const expByJob = { ...pending?.expByJob }
  for (const [job, exp] of Object.entries(incoming.expByJob ?? {})) expByJob[job as JobId] = cappedAmount((expByJob[job as JobId] ?? 0) + (exp ?? 0))
  profile.pendingOffline = pending
    ? { ms: pending.ms + incoming.ms, koban: cappedAmount(pending.koban + incoming.koban), exp: cappedAmount(pending.exp + incoming.exp), items: (pending.items ?? 0) + (incoming.items ?? 0), expByJob }
    : { ...incoming, expByJob }
}
export function claimOffline(profile: Profile): SimEvent[] {
  freezePendingOffline(profile)
  const pending = profile.pendingOffline, out: SimEvent[] = []
  if (!pending) return out
  addKoban(profile, pending.koban)
  for (const [job, exp] of Object.entries(pending.expByJob ?? {})) if (exp) grantExp(profile, exp, out, [job as JobId])
  for (let index = 0; index < (pending.items ?? 0); index++) {
    dropItem(profile, profile.progress.currentStage, 0, out, { max: ib.offlineMaxRarity })
  }
  profile.pendingOffline = null
  return out
}
export const dojoCost = (key: DojoKey, level: number) => Math.floor(cappedAmount(dojoDefs[key].cost * pb.dojoCostGrowth ** Math.min(level, b.maxStage)))
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
function validateRates(raw: unknown): Profile['rates'] {
  const gain = (value: unknown): value is Gain => isObject(value) && count(value.koban) && count(value.exp)
  if (!isObject(raw) || !gain(raw.current) || !Array.isArray(raw.minutes) || !raw.minutes.every(gain)) throw new Error('bad earnings')
  if (raw.legacyUnmeasuredGain !== undefined && raw.legacyUnmeasuredGain !== null && !gain(raw.legacyUnmeasuredGain)) throw new Error('bad legacy earnings')
  const legacy = raw.legacyUnmeasuredGain === undefined || raw.legacyUnmeasuredGain === null ? null : { ...raw.legacyUnmeasuredGain as Gain }
  if (raw.elapsedMs === undefined) {
    // Old saves retained the partial gain but not its duration. Preserve it as historical,
    // unmeasured earnings instead of fabricating a minute length or counting it again.
    const unmeasured = { koban: (legacy?.koban ?? 0) + raw.current.koban, exp: (legacy?.exp ?? 0) + raw.current.exp }
    if (!gain(unmeasured)) throw new Error('legacy earnings exceed supported range')
    return { current: { koban: 0, exp: 0 }, minutes: raw.minutes.map(value => ({ ...value })), elapsedMs: 0, legacyUnmeasuredGain: unmeasured }
  }
  if (!count(raw.elapsedMs, 0) || (raw.elapsedMs as number) >= pb.minuteMs) throw new Error('bad earnings elapsed time')
  return { current: { ...raw.current }, minutes: raw.minutes.map(value => ({ ...value })), elapsedMs: raw.elapsedMs as number, legacyUnmeasuredGain: legacy }
}
/** Old save versions are upgraded one step at a time. Each step has a test. */
export const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => {
    const party = isObject(old.party) ? old.party : {}
    const members = isObject(party.members) ? party.members : {}
    return { ...old, version: 2, rng: 1, inventory: [], nextItemId: 1, seenItems: [], options: { autoSellMaxRarity: null, autoEquip: true },
      stats: { ...(isObject(old.stats) ? old.stats : {}), drops: 0 },
      party: { ...party, members: Object.fromEntries(Object.entries(members).map(([id, member]) => [id, { ...(isObject(member) ? member : {}), equip: emptyEquip() }])) } }
  },
  2: (old) => {
    const party = isObject(old.party) ? old.party : {}
    const members = isObject(party.members) ? party.members : {}
    const order = Array.isArray(party.order) ? party.order : []
    const additions = partyOrder.slice(5)
    return { ...old, version: 3, party: { ...party,
      order: [...order, ...additions.filter((id) => !order.includes(id))],
      members: { ...Object.fromEntries(additions.map((id) => [id, { lv: 1, exp: 0, allocated: emptyAttributes(), autoStats: true, equip: emptyEquip() }])), ...members } } }
  },
}
function validateItem(raw: unknown): Item {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.slot !== 'string' || !Object.hasOwn(slots, raw.slot) || !Number.isInteger(raw.rarity) || !count(raw.rarity, 0, rarities.length - 1)
    || !Number.isInteger(raw.ilvl) || !count(raw.ilvl, 1, ib.maxIlvl) || typeof raw.name !== 'string' || !count(raw.atk) || !count(raw.hp) || !count(raw.def)
    || (raw.job !== undefined && (typeof raw.job !== 'string' || !Object.hasOwn(jobs, raw.job))) || (raw.slot === 'weapon' && raw.job === undefined) || !Array.isArray(raw.affixes)
    || !raw.affixes.every((affix) => isObject(affix) && typeof affix.k === 'string' && Object.hasOwn(affixes, affix.k) && count(affix.v, -1, 1000))) throw new Error('bad item')
  if (raw.equipmentClass !== undefined && !['heavy', 'light', 'robe', 'unique'].includes(String(raw.equipmentClass))) throw new Error('bad equipment class')
  if (raw.uniqueId !== undefined && (typeof raw.uniqueId !== 'string' || !Object.hasOwn(uniqueDefs, raw.uniqueId))) throw new Error('bad unique item')
  if (raw.baseRoll !== undefined && !count(raw.baseRoll, ib.baseRollMin, ib.baseRollMax)) throw new Error('bad item roll')
  if (raw.requirements !== undefined && (!isObject(raw.requirements) || !attributeKeys.every((key) => Number.isSafeInteger((raw.requirements as Record<string, unknown>)[key]) && count((raw.requirements as Record<string, unknown>)[key])))) throw new Error('bad item requirements')
  const item = { ...(raw as unknown as Item), locked: raw.locked === true, isNew: raw.isNew === true, baseRoll: raw.baseRoll === undefined ? 1 : raw.baseRoll as number, marketEligible: false as const }
  item.requirements = requirementsOf(item)
  return item
}
/** Throws on anything that could corrupt progression. Missing optional fields are filled from a new profile. */
export function validateProfile(input: unknown): Profile {
  if (!isObject(input) || !Number.isInteger(input.version)) throw new Error('unsupported save version')
  let raw: Record<string, unknown> = input
  while ((raw.version as number) < PROFILE_VERSION) {
    const migrate = migrations[raw.version as number]
    if (!migrate) throw new Error('unsupported save version')
    raw = migrate(raw)
  }
  if (raw.version !== PROFILE_VERSION) throw new Error('unsupported save version')
  const fresh = newProfile(typeof raw.savedAt === 'string' ? raw.savedAt : '')
  const progress = raw.progress, party = raw.party, dojo = raw.dojo
  if (!isObject(progress) || !Number.isSafeInteger(progress.unlockedStage) || !count(progress.unlockedStage, 1) || !Number.isSafeInteger(progress.currentStage) || !count(progress.currentStage, 1)) throw new Error('bad progress')
  if (!isObject(party) || !Array.isArray(party.order) || party.order.length !== partyOrder.length || !partyOrder.every((id) => (party.order as unknown[]).includes(id))) throw new Error('bad party order')
  if (!isObject(party.members)) throw new Error('bad members')
  if (!count(raw.koban)) throw new Error('bad koban')
  if (!Number.isInteger(raw.rng) || !count(raw.rng, 0, b.rng.divisor - 1)) throw new Error('bad rng')
  if (!Number.isSafeInteger(raw.nextItemId) || !count(raw.nextItemId, 1, Number.MAX_SAFE_INTEGER - 1)) throw new Error('bad next item id')
  if (!Array.isArray(raw.inventory)) throw new Error('bad inventory')
  const inventory = raw.inventory.map(validateItem)
  const ids = new Set(inventory.map((item) => item.id))
  if (ids.size !== inventory.length) throw new Error('duplicate item id')
  const members = {} as Record<JobId, Member>
  const worn = new Set<string>()
  for (const id of partyOrder) {
    const member = (party.members as Record<string, unknown>)[id]
    if (!isObject(member) || !Number.isInteger(member.lv) || !count(member.lv, 1, b.maxLevel) || !count(member.exp) || !isObject(member.equip)) throw new Error(`bad member ${id}`)
    const equip = emptyEquip()
    for (const slot of Object.keys(slots) as SlotId[]) {
      const itemId = member.equip[slot]
      if (itemId === null || itemId === undefined) continue
      const item = inventory.find((candidate) => candidate.id === itemId)
      if (!item || item.slot !== slot || (item.slot === 'weapon' && item.job !== id) || worn.has(item.id)) throw new Error(`bad equip ${id}`)
      worn.add(item.id); equip[slot] = item.id
    }
    if (member.allocated !== undefined && !isObject(member.allocated)) throw new Error('bad allocation')
    const allocated = { ...emptyAttributes(), ...(member.allocated as Partial<Attributes> | undefined) } as Attributes
    if (!attributeKeys.every((key) => Number.isSafeInteger(allocated[key]) && count(allocated[key])) || attributeKeys.reduce((sum, key) => sum + allocated[key], 0) > attributeBalance.pointsPerLevel * ((member.lv as number) - 1)) throw new Error('bad allocation')
    members[id] = { lv: member.lv as number, exp: member.exp as number, allocated, autoStats: member.autoStats !== false, equip }
    spendAuto(members[id], id)
  }
  if (!isObject(dojo) || !Object.keys(dojoDefs).every((key) => count(dojo[key] ?? 0, 0, dojoDefs[key as DojoKey].max ?? Number.MAX_SAFE_INTEGER))) throw new Error('bad dojo')
  const options = isObject(raw.options) ? raw.options : {}
  const profile = { ...fresh, ...raw } as Profile
  profile.party = { order: [...party.order] as JobId[], members }
  profile.inventory = inventory
  // A stale counter must not create duplicate IDs after loading a save.
  for (const item of inventory) {
    if (!/^i\d+$/.test(item.id)) continue
    const next = Number(item.id.slice(1)) + 1
    if (!Number.isSafeInteger(next) || next >= Number.MAX_SAFE_INTEGER) throw new Error('bad item id sequence')
    profile.nextItemId = Math.max(profile.nextItemId, next)
  }
  profile.options = { autoEquip: options.autoEquip !== false,
    autoSellMaxRarity: Number.isInteger(options.autoSellMaxRarity) && count(options.autoSellMaxRarity, 0, rarities.length - 1) ? options.autoSellMaxRarity as Rarity : null }
  profile.dojo = { ...fresh.dojo, ...(dojo as Profile['dojo']) }
  if (raw.stats !== undefined && !isObject(raw.stats)) throw new Error('bad statistics')
  profile.stats = { ...fresh.stats, ...(raw.stats as Partial<Profile['stats']> | undefined) }
  profile.rates = raw.rates === undefined ? fresh.rates : validateRates(raw.rates)
  profile.progress = { ...fresh.progress, ...(progress as unknown as Profile['progress']), loop: progress.loop === true }
  if (progress.depthRank !== undefined && (!Number.isInteger(progress.depthRank) || !count(progress.depthRank, 0, 2))) throw new Error('bad difficulty')
  if (progress.unlockedDepths !== undefined && (!Array.isArray(progress.unlockedDepths) || progress.unlockedDepths.length !== 3 || !progress.unlockedDepths.every((depth, index) => Number.isSafeInteger(depth) && count(depth, index === 0 ? 1 : 0, maxFloor(index as Difficulty))))) throw new Error('bad dungeon progress')
  if (progress.eventDepths !== undefined && (!Array.isArray(progress.eventDepths) || progress.eventDepths.length !== 3 || !progress.eventDepths.every((depth, index) => Number.isSafeInteger(depth) && count(depth, 0, maxFloor(index as Difficulty))))) throw new Error('bad floor event progress')
  const rank = progress.depthRank === undefined ? 0 : progress.depthRank as Difficulty
  const depths: [number, number, number] = progress.unlockedDepths === undefined
    ? [Math.min(progress.unlockedStage as number, b.maxStage), 0, 0] : [...progress.unlockedDepths as [number, number, number]]
  if (depths[rank] < 1 || (depths[1] > 0 && depths[0] < b.maxStage) || (depths[2] > 0 && depths[1] < b.maxStage)) throw new Error('bad dungeon progress')
  const claims: [number, number, number] = progress.eventDepths === undefined ? [0, 0, 0] : [...progress.eventDepths as [number, number, number]]
  profile.progress = { ...profile.progress, inTown: progress.inTown === true, depthRank: rank, unlockedDepths: depths, eventDepths: claims,
    unlockedStage: depths[rank], currentStage: Math.min(profile.progress.currentStage, depths[rank], maxFloor(rank)) }
  if (raw.dungeonId !== undefined && (typeof raw.dungeonId !== 'string' || !Object.hasOwn(dungeons, raw.dungeonId))) throw new Error('unsupported dungeon')
  profile.dungeonId = raw.dungeonId === undefined ? 'yomi' : raw.dungeonId as DungeonId
  if (raw.dungeonSeed !== undefined && (!Number.isInteger(raw.dungeonSeed) || !count(raw.dungeonSeed, 0, b.rng.divisor - 1))) throw new Error('bad dungeon seed')
  profile.dungeonSeed = raw.dungeonSeed === undefined ? 1 : raw.dungeonSeed as number
  profile.dungeonRecords = isObject(raw.dungeonRecords) ? { ...raw.dungeonRecords } as Record<string, DungeonProgress> : {}
  profile.dungeonRecords[profile.dungeonId] = profile.progress
  profile.abyssRecords = validateAbyssRecords(raw.abyssRecords)
  profile.seenEnemies = Array.isArray(raw.seenEnemies) ? raw.seenEnemies.filter((id): id is string => typeof id === 'string' && id in enemies) : []
  profile.seenItems = Array.isArray(raw.seenItems) ? raw.seenItems.filter((id): id is string => typeof id === 'string') : []
  if (raw.pendingOffline !== undefined && raw.pendingOffline !== null
    && (!isObject(raw.pendingOffline) || !count(raw.pendingOffline.koban) || !count(raw.pendingOffline.exp) || !count(raw.pendingOffline.ms))) throw new Error('bad offline rewards')
  profile.pendingOffline = raw.pendingOffline === undefined || raw.pendingOffline === null ? null : raw.pendingOffline as unknown as OfflineResult
  if (!Object.values(profile.stats).every((value) => count(value))) throw new Error('bad statistics')
  if (profile.pendingOffline && (profile.pendingOffline.items !== undefined && (!Number.isSafeInteger(profile.pendingOffline.items) || !count(profile.pendingOffline.items)))) throw new Error('bad offline items')
  const recordedJobs = raw.offlineJobs
  if (recordedJobs !== undefined && (!Array.isArray(recordedJobs) || recordedJobs.length !== deployedJobs(profile.party.order).length || new Set(recordedJobs).size !== recordedJobs.length || !recordedJobs.every(job => typeof job === 'string' && Object.hasOwn(jobs, job)))) throw new Error('bad offline recipients')
  profile.offlineJobs = recordedJobs === undefined ? deployedJobs(profile.party.order) : [...recordedJobs as JobId[]]
  if (profile.pendingOffline?.expByJob !== undefined && (!isObject(profile.pendingOffline.expByJob) || !Object.entries(profile.pendingOffline.expByJob).every(([job, exp]) => Object.hasOwn(jobs, job) && count(exp)))) throw new Error('bad offline experience')
  freezePendingOffline(profile)
  reconcileEquipment(profile)
  return profile
}
