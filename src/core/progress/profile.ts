import { balance as b } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { affixes, itemBalance as ib, rarities, slots, type Rarity, type SlotId } from '../data/items.ts'
import { jobs, partyOrder } from '../data/jobs.ts'
import { dojo as dojoDefs, progressBalance as pb, type DojoKey } from '../data/progress.ts'
import type { JobId, SimEvent } from '../sim/types.ts'
import { dropChance, partyLuk, receiveItem, rollItem, type Item } from './items.ts'
import { random } from '../sim/rng.ts'

export const PROFILE_VERSION = 2
export interface Gain { koban: number; exp: number }
export interface OfflineResult { ms: number; koban: number; exp: number; items?: number }
export interface Member { lv: number; exp: number; equip: Record<SlotId, string | null> }
export interface Profile {
  version: number
  savedAt: string                                   // Written by main; core never reads the clock.
  rng: number                                       // Drop stream, separate from the battle RNG.
  progress: { unlockedStage: number; currentStage: number; loop: boolean }
  party: { order: JobId[]; members: Record<JobId, Member> }
  koban: number
  dojo: Record<DojoKey, number>
  inventory: Item[]                                 // Equipped items included.
  nextItemId: number
  options: { autoSellMaxRarity: Rarity | null; autoEquip: boolean }
  stats: { kills: number; wipes: number; bossKills: number; stageClears: number; playMs: number; totalKoban: number; drops: number }
  rates: { current: Gain; minutes: Gain[] }        // Last 10 closed minutes, for offline rewards.
  seenEnemies: string[]
  seenItems: string[]
  pendingOffline: OfflineResult | null
}
const emptyEquip = (): Record<SlotId, string | null> => ({ weapon: null, armor: null, charm: null })
export function newProfile(savedAt: string, seed = 1): Profile {
  return { version: PROFILE_VERSION, savedAt, rng: seed >>> 0,
    progress: { unlockedStage: 1, currentStage: 1, loop: false },
    party: { order: [...partyOrder], members: Object.fromEntries(partyOrder.map((id) => [id, { lv: 1, exp: 0, equip: emptyEquip() }])) as Profile['party']['members'] },
    koban: 0, dojo: { atk: 0, hp: 0, walk: 0, drop: 0, offline: 0 }, inventory: [], nextItemId: 1,
    options: { autoSellMaxRarity: null, autoEquip: true },
    stats: { kills: 0, wipes: 0, bossKills: 0, stageClears: 0, playMs: 0, totalKoban: 0, drops: 0 },
    rates: { current: { koban: 0, exp: 0 }, minutes: [] }, seenEnemies: [], seenItems: [], pendingOffline: null }
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

/** Rolls and stores one item; emits a 'drop' event for the strip. */
export function dropItem(profile: Profile, ilvl: number, x: number, out: SimEvent[], range: { min?: Rarity; max?: Rarity } = {}) {
  const item = rollItem(profile, `i${profile.nextItemId++}`, { ilvl, luk: partyLuk(profile), jobs: partyOrder, minRarity: range.min, maxRarity: range.max })
  const kind = `${item.slot}:${item.job ?? ''}:${item.name}`
  if (!profile.seenItems.includes(kind)) profile.seenItems.push(kind)
  profile.stats.drops++
  const result = receiveItem(profile, item)
  out.push({ t: 'drop', x, rarity: item.rarity, name: item.name, equippedBy: result.equippedBy })
  return result
}

/** Applies one tick of simulation events. Returns derived events (levelUp, drop) and what changed. */
export function applyRewards(profile: Profile, events: readonly SimEvent[]) {
  const out: SimEvent[] = []
  let changed = false, stageCleared = false, gearChanged = false
  for (const event of events) {
    if (event.t === 'reward') {
      addKoban(profile, event.koban)
      if (event.exp) grantExp(profile, event.exp, out)
      profile.rates.current.koban += event.koban; profile.rates.current.exp += event.exp
      const enemy = enemies[event.enemyId]
      if (enemy) {
        profile.stats.kills++
        if (enemy.boss) profile.stats.bossKills++
        if (!profile.seenEnemies.includes(event.enemyId)) profile.seenEnemies.push(event.enemyId)
        if (random(profile) < dropChance(profile, Boolean(enemy.boss))) {
          const result = dropItem(profile, event.stageNo ?? profile.progress.currentStage, event.x, out, enemy.boss ? { min: ib.bossMinRarity } : {})
          if (result.equippedBy) gearChanged = true
        }
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
/** Offline rewards: average × elapsed minutes × 0.5, capped at 8 hours plus dojo; one 並/上 roll per 10 minutes. */
export function computeOffline(profile: Profile, elapsedMs: number): OfflineResult | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < pb.offlineMinMs) return null
  const ms = Math.min(elapsedMs, pb.offlineMaxMs + dojoDefs.offline.per * profile.dojo.offline)
  const rate = perMinute(profile), minutes = ms / pb.minuteMs
  const result = { ms, koban: Math.floor(rate.koban * minutes * pb.offlineRate), exp: Math.floor(rate.exp * minutes * pb.offlineRate),
    items: rate.koban ? Math.floor(ms / ib.offlineDropEveryMs) : 0 }
  return result.koban || result.exp ? result : null
}
export function addOffline(profile: Profile, result: OfflineResult) {
  const pending = profile.pendingOffline
  profile.pendingOffline = pending
    ? { ms: pending.ms + result.ms, koban: pending.koban + result.koban, exp: pending.exp + result.exp, items: (pending.items ?? 0) + (result.items ?? 0) }
    : result
}
export function claimOffline(profile: Profile): SimEvent[] {
  const pending = profile.pendingOffline, out: SimEvent[] = []
  if (!pending) return out
  addKoban(profile, pending.koban); grantExp(profile, pending.exp, out)
  for (let index = 0; index < (pending.items ?? 0); index++) {
    dropItem(profile, profile.progress.currentStage, 0, out, { max: ib.offlineMaxRarity })
  }
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
/** Old save versions are upgraded one step at a time. Each step has a test. */
export const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => {
    const party = isObject(old.party) ? old.party : {}
    const members = isObject(party.members) ? party.members : {}
    return { ...old, version: 2, rng: 1, inventory: [], nextItemId: 1, seenItems: [], options: { autoSellMaxRarity: null, autoEquip: true },
      stats: { ...(isObject(old.stats) ? old.stats : {}), drops: 0 },
      party: { ...party, members: Object.fromEntries(Object.entries(members).map(([id, member]) => [id, { ...(isObject(member) ? member : {}), equip: emptyEquip() }])) } }
  },
}
function validateItem(raw: unknown): Item {
  if (!isObject(raw) || typeof raw.id !== 'string' || !(raw.slot as string in slots) || !Number.isInteger(raw.rarity) || !count(raw.rarity, 0, rarities.length - 1)
    || !Number.isInteger(raw.ilvl) || !count(raw.ilvl, 1, b.maxStage * 2) || typeof raw.name !== 'string' || !count(raw.atk) || !count(raw.hp) || !count(raw.def)
    || (raw.job !== undefined && !(raw.job as string in jobs)) || (raw.slot === 'weapon' && raw.job === undefined) || !Array.isArray(raw.affixes)
    || !raw.affixes.every((affix) => isObject(affix) && (affix.k as string) in affixes && count(affix.v, -1, 1000))) throw new Error('bad item')
  return { ...(raw as unknown as Item), locked: raw.locked === true, isNew: raw.isNew === true }
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
  if (!isObject(progress) || !count(progress.unlockedStage, 1, b.maxStage) || !count(progress.currentStage, 1, b.maxStage)) throw new Error('bad progress')
  if (!isObject(party) || !Array.isArray(party.order) || party.order.length !== partyOrder.length || !partyOrder.every((id) => (party.order as unknown[]).includes(id))) throw new Error('bad party order')
  if (!isObject(party.members)) throw new Error('bad members')
  if (!count(raw.koban)) throw new Error('bad koban')
  if (!count(raw.rng, 0, b.rng.divisor - 1) || !Number.isInteger(raw.nextItemId) || !count(raw.nextItemId, 1)) throw new Error('bad rng')
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
    members[id] = { lv: member.lv as number, exp: member.exp as number, equip }
  }
  if (!isObject(dojo) || !Object.keys(dojoDefs).every((key) => count(dojo[key] ?? 0, 0, dojoDefs[key as DojoKey].max ?? Number.MAX_SAFE_INTEGER))) throw new Error('bad dojo')
  const options = isObject(raw.options) ? raw.options : {}
  const profile = { ...fresh, ...raw } as Profile
  profile.party = { order: [...party.order] as JobId[], members }
  profile.inventory = inventory
  // A stale counter must not create duplicate IDs after loading a save.
  profile.nextItemId = Math.max(profile.nextItemId, ...inventory.map((item) => /^i\d+$/.test(item.id) ? Number(item.id.slice(1)) + 1 : 1))
  profile.options = { autoEquip: options.autoEquip !== false,
    autoSellMaxRarity: Number.isInteger(options.autoSellMaxRarity) && count(options.autoSellMaxRarity, 0, rarities.length - 1) ? options.autoSellMaxRarity as Rarity : null }
  profile.dojo = { ...fresh.dojo, ...(dojo as Profile['dojo']) }
  profile.stats = { ...fresh.stats, ...(isObject(raw.stats) ? raw.stats as Profile['stats'] : {}) }
  profile.rates = isObject(raw.rates) && Array.isArray(raw.rates.minutes) ? raw.rates as Profile['rates'] : fresh.rates
  profile.progress = { ...fresh.progress, ...(progress as Profile['progress']), loop: progress.loop === true }
  profile.progress.currentStage = Math.min(profile.progress.currentStage, profile.progress.unlockedStage)
  profile.seenEnemies = Array.isArray(raw.seenEnemies) ? raw.seenEnemies.filter((id): id is string => typeof id === 'string' && id in enemies) : []
  profile.seenItems = Array.isArray(raw.seenItems) ? raw.seenItems.filter((id): id is string => typeof id === 'string') : []
  profile.pendingOffline = isObject(raw.pendingOffline) && count(raw.pendingOffline.koban) && count(raw.pendingOffline.exp) && count(raw.pendingOffline.ms)
    ? raw.pendingOffline as unknown as OfflineResult : null
  return profile
}
