import { balance as b } from '../data/balance.ts'
import { affixes, armorNames, charmNames, gearWeights, itemBalance as ib, rarities, slots, weaponNames, type AffixKey, type Rarity, type SlotId } from '../data/items.ts'
import { jobs, partyOrder } from '../data/jobs.ts'
import { dojo as dojoDefs } from '../data/progress.ts'
import { random } from '../sim/rng.ts'
import { computeStats } from '../sim/stats.ts'
import type { GearStats, JobId, Stats } from '../sim/types.ts'
import type { Profile } from './profile.ts'

export interface Item extends GearStats {
  id: string; slot: SlotId; job?: JobId; ilvl: number; rarity: Rarity; name: string; locked: boolean; isNew: boolean
}
const slotIds = Object.keys(slots) as SlotId[]
const affixKeys = Object.keys(affixes) as AffixKey[]
const pick = <T>(state: { rng: number }, entries: readonly T[], weight: (entry: T) => number) => {
  let roll = random(state) * entries.reduce((sum, entry) => sum + weight(entry), 0)
  for (const entry of entries) { roll -= weight(entry); if (roll < 0) return entry }
  return entries[entries.length - 1]
}
const round3 = (value: number) => Math.round(value * 1000) / 1000

export function itemName(slot: SlotId, job: JobId | undefined, ilvl: number) {
  const band = Math.floor((ilvl - 1) / ib.nameBand)
  const names = slot === 'weapon' ? weaponNames[job!] : slot === 'armor' ? armorNames : charmNames
  const base = names[Math.min(band, names.length - 1)]
  const extra = band - (names.length - 1)
  return extra > 0 ? `${base}・改${'弐参肆伍陸漆捌玖'[Math.min(extra, 8) - 1] ?? ''}` : base
}

export interface RollOptions { ilvl: number; luk: number; jobs: readonly JobId[]; minRarity?: Rarity; maxRarity?: Rarity }
/** Rarity weights r≥1 grow with party LUK (03 §3.1). Uses the profile's own RNG stream, separate from the battle. */
export function rollItem(state: { rng: number }, id: string, options: RollOptions): Item {
  const min = options.minRarity ?? 0, max = options.maxRarity ?? (rarities.length - 1) as Rarity
  const candidates = rarities.map((rarity, index) => ({ index: index as Rarity, weight: rarity.weight * (index ? 1 + options.luk / ib.lukRarityDiv * index : 1) }))
    .filter((entry) => entry.index >= min && entry.index <= max)
  const rarity = pick(state, candidates, (entry) => entry.weight).index
  const slot = pick(state, slotIds, (key) => slots[key].weight)
  const job = slot === 'weapon' ? options.jobs[Math.floor(random(state) * options.jobs.length)] : undefined
  const growth = ib.growth ** (options.ilvl - 1) * rarities[rarity].mul
  const count = rarities[rarity].affixes + (slot === 'charm' ? ib.charmExtraAffix : 0)
  const pool = [...affixKeys], rolled: Item['affixes'] = []
  for (let index = 0; index < count && pool.length; index++) {
    const key = pool.splice(Math.floor(random(state) * pool.length), 1)[0], def = affixes[key]
    const value = (def.min + (def.max - def.min) * random(state)) * rarities[rarity].mul * (def.scale ? 1 + options.ilvl * ib.lukScalePerIlvl : 1)
    rolled.push({ k: key, v: def.percent ? round3(value) : Math.round(value * 10) / 10 })
  }
  return { id, slot, job, ilvl: options.ilvl, rarity, name: itemName(slot, job, options.ilvl), locked: false, isNew: true,
    atk: slot === 'weapon' ? round3(ib.weaponAtk * ib.jobAtkMul[job!] * growth) : 0,
    hp: slot === 'armor' ? round3(ib.armorHp * growth) : 0, def: slot === 'armor' ? round3(ib.armorDef * growth) : 0, affixes: rolled }
}
export const sellPrice = (item: Item) => Math.floor(ib.sellBase * ib.sellGrowth ** (item.ilvl - 1) * rarities[item.rarity].sell)
export const canEquip = (job: JobId, item: Item) => item.slot !== 'weapon' || item.job === job
export function describe(item: Item): string[] {
  const lines: string[] = []
  if (item.atk) lines.push(`攻撃 +${Math.round(item.atk * 10) / 10}`)
  if (item.hp) lines.push(`最大HP +${Math.round(item.hp)}`)
  if (item.def) lines.push(`防御 +${Math.round(item.def * 10) / 10}`)
  for (const affix of item.affixes) {
    const def = affixes[affix.k]
    lines.push(`${def.name} ${affix.v > 0 ? '+' : ''}${def.percent ? `${Math.round(affix.v * 1000) / 10}%` : affix.v}`)
  }
  return lines
}

export function equipped(profile: Profile, job: JobId): Item[] {
  const equip = profile.party.members[job].equip
  return slotIds.map((slot) => profile.inventory.find((item) => item.id === equip[slot])).filter((item): item is Item => item !== undefined)
}
export const gearMap = (profile: Profile) => Object.fromEntries(partyOrder.map((job) => [job, equipped(profile, job)])) as Record<JobId, Item[]>
export const ownerOf = (profile: Profile, itemId: string) =>
  partyOrder.find((job) => Object.values(profile.party.members[job].equip).includes(itemId))
export const statsOf = (profile: Profile, job: JobId, gear = equipped(profile, job)) => computeStats(jobs[job], profile.party.members[job].lv, profile.dojo, gear)

/** One number per job so different items can be compared (higher is better). */
export function power(job: JobId, stats: Stats) {
  const w = gearWeights[job]
  const dps = stats.atk * 1000 / stats.intervalMs * (1 + stats.cri * (stats.criMul - 1))
  const tank = stats.maxHp * (1 + stats.def * b.defK / b.defBase) / (1 - Math.min(stats.eva, b.maxEva))
  return dps * (w.dps + w.koban * (stats.kobanMul - 1) + w.cooldown * (1 / stats.cooldownMul - 1) + (stats.dropMul - 1))
    + tank * w.tank + stats.luk * w.luk
}
/** Power change if `item` replaced what `job` wears in that slot. */
export function scoreDelta(profile: Profile, job: JobId, item: Item) {
  if (!canEquip(job, item)) return null
  const current = equipped(profile, job)
  const swapped = [...current.filter((worn) => worn.slot !== item.slot && worn.id !== item.id), item]
  return power(job, statsOf(profile, job, swapped)) - power(job, statsOf(profile, job, current))
}
export function equipItem(profile: Profile, job: JobId, slot: SlotId, itemId: string | null): { ok: true } | { ok: false; reason: string } {
  const member = profile.party.members[job]
  if (itemId === null) { member.equip[slot] = null; return { ok: true } }
  const item = profile.inventory.find((candidate) => candidate.id === itemId)
  if (!item) return { ok: false, reason: '持っていない装備です' }
  if (item.slot !== slot) return { ok: false, reason: '装備する場所が違います' }
  if (!canEquip(job, item)) return { ok: false, reason: `${jobs[job].name}は装備できません` }
  const owner = ownerOf(profile, itemId)
  if (owner) profile.party.members[owner].equip[slot] = null
  member.equip[slot] = itemId; item.isNew = false
  return { ok: true }
}
export function sellItems(profile: Profile, ids: readonly string[]): { ok: true; koban: number } | { ok: false; reason: string } {
  const targets = profile.inventory.filter((item) => ids.includes(item.id))
  if (targets.length !== new Set(ids).size) return { ok: false, reason: '持っていない装備が含まれています' }
  if (targets.some((item) => item.locked)) return { ok: false, reason: 'ロック中の装備は売れません' }
  if (targets.some((item) => ownerOf(profile, item.id))) return { ok: false, reason: '装備中のものは売れません' }
  const koban = targets.reduce((sum, item) => sum + sellPrice(item), 0)
  profile.inventory = profile.inventory.filter((item) => !ids.includes(item.id))
  profile.koban += koban; profile.stats.totalKoban += koban
  return { ok: true, koban }
}
/** Auto-equip → auto-sell → inventory cap (03 §3.4). Returns who equipped it, or whether it was sold. */
export function receiveItem(profile: Profile, item: Item): { equippedBy?: JobId; sold: boolean } {
  profile.inventory.push(item)
  const best = profile.options.autoEquip
    ? partyOrder.map((job) => ({ job, delta: scoreDelta(profile, job, item) }))
      .filter((entry): entry is { job: JobId; delta: number } => entry.delta !== null && entry.delta > 0)
      .sort((a, z) => z.delta - a.delta)[0]
    : undefined
  const limit = profile.options.autoSellMaxRarity
  if (!best && limit !== null && item.rarity <= limit && !item.locked) { sellItems(profile, [item.id]); return { sold: true } }
  if (profile.inventory.length > ib.inventoryMax) {
    // Make room before equipping: otherwise a full, locked bag can grow past the cap.
    const spare = profile.inventory.filter((candidate) => (!best || candidate.id !== item.id) && !candidate.locked && !ownerOf(profile, candidate.id))
      .sort((a, z) => a.rarity - z.rarity || a.ilvl - z.ilvl)[0]
    const target = spare ?? item
    const result = sellItems(profile, [target.id])
    if (result.ok && target === item) return { sold: true }
  }
  if (best) { equipItem(profile, best.job, item.slot, item.id); item.isNew = true; return { equippedBy: best.job, sold: false } }
  return { sold: false }
}
/** Drop chance for one defeated enemy, with dojo, gear dropPct and the pachipro's LUK (03 §3.1). */
export function dropChance(profile: Profile, boss: boolean) {
  if (boss) return 1
  const gear = gearMap(profile)
  const dropPct = partyOrder.reduce((sum, job) => sum + statsOf(profile, job, gear[job]).dropMul - 1, 0)
  const pachiLuk = statsOf(profile, 'pachipro', gear.pachipro).luk
  return ib.dropChance * (1 + dojoDefs.drop.per * profile.dojo.drop + dropPct) * (1 + pachiLuk * ib.pachiLukDrop)
}
export const partyLuk = (profile: Profile) => partyOrder.reduce((sum, job) => sum + statsOf(profile, job).luk, 0)
