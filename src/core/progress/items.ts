import { cappedAmount, depthScale, progressionDepth, type Difficulty } from '../data/dungeon.ts'
import { balance as b } from '../data/balance.ts'
import { attributeDefs, attributeKeys, attributeLabels, requirementsBalance as rb, emptyAttributes, type Attributes } from '../data/attributes.ts'
import { attributesOf } from './attributes.ts'
import { affixRarityMultipliers, currentRollVersion, uniqueDefs, affixes, armorClassNames, charmNames, gearWeights, itemBalance as ib, rarities, slots, weaponNames, type AffixKey, type Rarity, type SlotId } from '../data/items.ts'
import { equipmentNameRanks, equipmentMarkStart, equipmentMarkSpan, type ArmorClass } from '../data/itemNames.ts'
import { deployedJobs, jobs, partyOrder } from '../data/jobs.ts'
import { dojo as dojoDefs } from '../data/progress.ts'
import { random } from '../sim/rng.ts'
import { engravingBalance, engravingCandidates, skillEngravings } from '../data/skillEngravings.ts'
import { lootTendency } from '../data/loot.ts'
import { computeStats } from '../sim/stats.ts'
import { gearContribution } from '../sim/gearContribution.ts'
import type { GearStats, JobId, Stats } from '../sim/types.ts'
import type { Profile } from './profile.ts'

export interface Item extends GearStats {
  id: string; requirements?: Attributes; baseRoll?: number; marketEligible?: false; equipmentClass?: 'heavy' | 'light' | 'robe' | 'unique'; uniqueId?: string; slot: SlotId; job?: JobId; ilvl: number; rarity: Rarity; name: string; locked: boolean; isNew: boolean
}
const slotIds = Object.keys(slots) as SlotId[]
const affixKeys = Object.keys(affixes) as AffixKey[]
const pick = <T>(state: { rng: number }, entries: readonly T[], weight: (entry: T) => number) => {
  let roll = random(state) * entries.reduce((sum, entry) => sum + weight(entry), 0)
  for (const entry of entries) { roll -= weight(entry); if (roll < 0) return entry }
  return entries[entries.length - 1]
}
const round3 = (value: number) => Math.round(value * 1000) / 1000

export function itemName(slot: SlotId, job: JobId | undefined, ilvl: number, armorClass: ArmorClass = 'light') {
  const band = equipmentNameRanks.reduce((band, rank, index) => ilvl >= rank ? index : band, 0)
  const names = slot === 'weapon' ? weaponNames[job!] : slot === 'armor' ? armorClassNames[armorClass] : charmNames
  const base = names[Math.min(band, names.length - 1)]
  const extra = ilvl < equipmentMarkStart ? 0 : Math.floor((ilvl - equipmentMarkStart) / equipmentMarkSpan) + 1
  const tier = extra <= 8 ? '弐参肆伍陸漆捌玖'[extra - 1] : String(extra + 1)
  return extra > 0 ? `${base}・改${tier}` : base
}

/** Quality continues across difficulty transitions; it is never a character-level requirement. */
export const lootRank = (floor: number, difficulty: Difficulty) => progressionDepth(floor, difficulty)
const deepRanks = (rank: number) => Math.log2(1 + Math.max(0, rank - ib.softIlvl) / ib.deepRankSpan)
const scaledRank = (rank: number) => Math.min(rank, ib.softIlvl) + deepRanks(rank) * 5

// Absent floor is an area-neutral roll for callers without an expedition context.
export interface RollOptions { ilvl: number; floor?: number; luk: number; jobs: readonly JobId[]; activeJobs?: readonly JobId[]; slot?: SlotId; armorClass?: ArmorClass; minRarity?: Rarity; maxRarity?: Rarity }
/** Rarity weights r≥1 grow with party LUK (03 §3.1). Uses the profile's own RNG stream, separate from the battle. */
export function rollItem(state: { rng: number }, id: string, options: RollOptions): Item {
  const tendency = options.floor === undefined ? undefined : lootTendency(options.floor)
  options = { ...options, ilvl: Math.max(1, Math.min(ib.maxIlvl, Math.floor(options.ilvl))) }
  const min = options.minRarity ?? 0, max = options.maxRarity ?? (rarities.length - 1) as Rarity
  const candidates = rarities.map((rarity, index) => ({ index: index as Rarity, weight: rarity.weight * (index ? 1 + options.luk / ib.lukRarityDiv * index : 1) }))
    .filter((entry) => entry.index >= min && entry.index <= max)
  const rarity = pick(state, candidates, (entry) => entry.weight).index
  const uniqueEntry = rarity === ib.uniqueRarity ? pick(state, Object.entries(uniqueDefs).filter(([, def]) => !def.main || options.jobs.some((job) => attributeDefs[job].main === def.main)), () => 1) : undefined
  const unique = uniqueEntry?.[1]
  const slot = unique?.slot ?? options.slot ?? pick(state, slotIds, (key) => tendency ? tendency.weights[key] : slots[key].weight)
  const availableJobs = unique?.main ? options.jobs.filter((job) => attributeDefs[job].main === unique.main) : options.jobs
  const active = availableJobs.filter(job => options.activeJobs?.includes(job))
  const reserves = availableJobs.filter(job => !active.includes(job))
  const weaponPool = slot === 'weapon' && active.length && reserves.length
    ? (random(state) < ib.activeWeaponShare ? active : reserves) : availableJobs
  const job = slot === 'weapon' ? weaponPool[Math.floor(random(state) * weaponPool.length)] : undefined
  const equipmentClass = unique ? 'unique' : slot === 'armor' ? options.armorClass ?? pick(state, ['heavy', 'light', 'robe'] as const, () => 1) : undefined
  const baseRoll = round3(ib.baseRollMin + random(state) * (ib.baseRollMax - ib.baseRollMin))
  // Weapon output tracks enemy HP; protection tracks enemy attack/defense separately.
  // Stored items retain their rolled numbers; only newly generated equipment uses this curve.
  const growth = depthScale(options.ilvl), rarityMul = rarities[rarity].mul
  const count = rarities[rarity].affixes + (slot === 'charm' ? ib.charmExtraAffix : 0)
  const rolled: Item['affixes'] = unique ? unique.affixes.map((affix) => ({ ...affix })) : []
  const pool = affixKeys.filter((key) => !rolled.some((affix) => affix.k === key))
  for (let index = rolled.length; index < count && pool.length; index++) {
    const key = pool.splice(Math.floor(random(state) * pool.length), 1)[0], def = affixes[key]
    const value = (def.min + (def.max - def.min) * random(state)) * affixRarityMultipliers[rarity] * (def.scale ? 1 + scaledRank(options.ilvl) * ib.lukScalePerIlvl : 1)
    rolled.push({ k: key, v: def.percent ? round3(value) : Math.round(value * 10) / 10 })
  }
  const item: Item = { id, slot, job, ilvl: options.ilvl, rarity, rollVersion: currentRollVersion, name: unique?.name ?? itemName(slot, job, options.ilvl, equipmentClass === 'unique' ? undefined : equipmentClass), locked: false, isNew: true, baseRoll, equipmentClass, uniqueId: uniqueEntry?.[0], marketEligible: false,
    atk: slot === 'weapon' ? round3(ib.weaponAtk * ib.jobAtkMul[job!] * growth.hp * rarityMul * baseRoll * (unique?.atkMul ?? 1)) : 0,
    hp: slot === 'armor' ? round3(ib.armorHp * growth.atk * rarityMul * baseRoll * (unique?.hpMul ?? 1)) : 0, def: slot === 'armor' ? round3(ib.armorDef * growth.def * rarityMul * baseRoll * (unique?.defMul ?? 1)) : 0, affixes: rolled }
  if (slot === 'weapon' && job && !unique && (rarity === 3 || rarity === 4) && random(state) < engravingBalance.chance) {
    const candidates = engravingCandidates(job)
    if (!candidates.length) throw new Error(`No engraving for ${job}`)
    item.engraving = candidates[Math.floor(random(state) * candidates.length)]
  }
  item.requirements = requirementsOf(item)
  return item
}
export const sellPrice = (item: Item) => Math.floor(cappedAmount(ib.sellBase * depthScale(item.ilvl).reward * rarities[item.rarity].sell))
export function requirementsOf(item: Item): Attributes {
  if (item.requirements) return { ...item.requirements }
  if (item.uniqueId && uniqueDefs[item.uniqueId]) return { ...uniqueDefs[item.uniqueId].requirements }
  const req = emptyAttributes(), n = Math.max(0, Math.min(ib.maxRequirementRank, scaledRank(item.ilvl)) - 1)
  if (item.slot === 'weapon' && item.job) { const def = attributeDefs[item.job]; req[def.main] = Math.max(0, def.base[def.main] - 2) + Math.floor(n * rb.weaponPerRank) }
  else if (item.slot === 'armor') {
    if (item.equipmentClass === 'heavy') { req.str = rb.heavyStr + Math.floor(n * rb.heavyPerRank); req.vit = rb.heavyVit + Math.floor(n * rb.heavyPerRank) }
    else if (item.equipmentClass === 'robe') { req.int = rb.robeInt + Math.floor(n * rb.robePerRank); req.vit = rb.robeVit }
    else { req.dex = rb.lightDex + Math.floor(n * rb.lightPerRank); req.vit = rb.lightVit }
  } else for (const key of attributeKeys) req[key] = Math.floor(n * rb.charmPerRank)
  return req
}
/** Class-only compatibility; use equipCheck for the complete attribute check. */
export const canEquip = (job: JobId, item: Item) => (item.slot !== 'weapon' || item.job === job)
  && (item.equipmentClass !== 'heavy' || attributeDefs[job].main === 'str') && (item.equipmentClass !== 'robe' || attributeDefs[job].main === 'int')
export type EquipmentEligibility = { ok: true } | { ok: false; reason: string; missing?: Array<{ key: keyof Attributes; current: number; required: number }> }
function checkAttributes(job: JobId, item: Item, attrs: Attributes, req: Attributes): EquipmentEligibility {
  if (!canEquip(job, item)) return { ok: false, reason: 'このジョブでは扱えない種類の装備です' }
  const missing = attributeKeys.filter((key) => attrs[key] < req[key])
  return missing.length ? { ok: false, reason: missing.map((key) => attributeLabels[key] + req[key] + '必要（現在' + attrs[key] + '）').join('、'),
    missing: missing.map(key => ({ key, current: attrs[key], required: req[key] })) } : { ok: true }
}
export function equipCheck(profile: Profile, job: JobId, item: Item): EquipmentEligibility {
  return checkAttributes(job, item, attributesOf(job, profile.party.members[job].allocated), requirementsOf(item))
}
export function reconcileEquipment(profile: Profile) {
  for (const job of partyOrder) for (const slot of slotIds) {
    const item = profile.inventory.find((candidate) => candidate.id === profile.party.members[job].equip[slot])
    if (item && !equipCheck(profile, job, item).ok) profile.party.members[job].equip[slot] = null
  }
}
export function describe(item: Item): string[] {
  const lines: string[] = [`基礎性能${Math.round((item.baseRoll ?? 1) * 100)}%（85〜115%）`]
  if (item.uniqueId && uniqueDefs[item.uniqueId]) lines.push(uniqueDefs[item.uniqueId].build)
  if (item.engraving) lines.push(skillEngravings[item.engraving].description)
  if (item.slot === 'weapon' && item.job) lines.push(jobs[item.job].name + '専用')
  if (item.equipmentClass === 'heavy') lines.push('重装：筋力主ジョブ専用')
  if (item.equipmentClass === 'robe') lines.push('法衣：知力主ジョブ専用')
  const req = requirementsOf(item)
  lines.push('必要能力：' + (attributeKeys.filter((key) => req[key] > 0).map((key) => attributeLabels[key] + req[key]).join(' / ') || 'なし'))
  const effective = gearContribution(item)
  if (effective.atk) lines.push(`攻撃 +${Math.round(effective.atk * 10) / 10}`)
  if (effective.hp) lines.push(`最大HP +${Math.round(effective.hp)}`)
  if (effective.def) lines.push(`防御 +${Math.round(effective.def * 10) / 10}`)
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
export const statsOf = (profile: Profile, job: JobId, gear = equipped(profile, job)) => computeStats(jobs[job], profile.party.members[job].lv, profile.dojo, gear, profile.party.members[job].allocated)

/** One number per job so different items can be compared (higher is better). */
export function power(job: JobId, stats: Stats) {
  const w = gearWeights[job]
  const dps = stats.atk * 1000 / stats.intervalMs * (1 + stats.cri * (stats.criMul - 1))
  const tank = stats.maxHp * (1 + stats.def * b.defK / b.defBase) / ((1 - Math.min(stats.eva, b.maxEva)) * stats.dmgTakenMul)
  // Positive weighted averages: longer cooldowns cannot make more ATK lower the score.
  const cooldown = (1 + w.cooldown / stats.cooldownMul) / (1 + w.cooldown)
  const income = (1 + w.koban * stats.kobanMul) / (1 + w.koban)
  return dps * w.dps * cooldown * income * stats.dropMul
    + tank * w.tank + stats.luk * w.luk
}
/** Power change if `item` replaced what `job` wears in that slot. */
export function compareEquipment(profile: Profile, job: JobId, item: Item) {
  if (!equipCheck(profile, job, item).ok) return null
  const current = equipped(profile, job)
  return compareWithCurrent(profile, job, item, current, statsOf(profile, job, current))
}
function compareWithCurrent(profile: Profile, job: JobId, item: Item, current: Item[], before: Stats) {
  const swapped = [...current.filter((worn) => worn.slot !== item.slot && worn.id !== item.id), item]
  const after = statsOf(profile, job, swapped)
  const replaced = current.find(worn => worn.slot === item.slot)
  const skillTradeoff = item.engraving !== replaced?.engraving ? {
    before: replaced?.engraving ? skillEngravings[replaced.engraving].description : undefined,
    after: item.engraving ? skillEngravings[item.engraving].description : undefined,
  } : undefined
  return { before, after, replaced, skillTradeoff, delta: skillTradeoff ? null : power(job, after) - power(job, before) }
}
/** Synchronous view-build scope only. Never retain this context across profile mutations. */
export function createEquipmentComparison(profile: Profile) {
  const members = partyOrder.map((job) => {
    const current = equipped(profile, job)
    return { job, current, before: statsOf(profile, job, current), attrs: attributesOf(job, profile.party.members[job].allocated) }
  })
  return (item: Item) => {
    const requirements = requirementsOf(item)
    return members.map(({ job, current, before, attrs }) => {
      const check = checkAttributes(job, item, attrs, requirements)
      return { job, check, comparison: check.ok ? compareWithCurrent(profile, job, item, current, before) : null }
    })
  }
}
export function scoreDelta(profile: Profile, job: JobId, item: Item) {
  return compareEquipment(profile, job, item)?.delta ?? null
}
/** Automation only accepts an upgrade without sacrificing another stat or a chosen unique build. */
function automaticUpgrade(profile: Profile, job: JobId, item: Item): number | null {
  const comparison = compareEquipment(profile, job, item)
  if (!comparison || comparison.delta === null || comparison.delta <= 0 || item.uniqueId || item.engraving) return null
  const { before, after, replaced, delta } = comparison
  if (replaced?.uniqueId || replaced?.locked || replaced?.engraving) return null
  const higher: Array<keyof Stats> = ['atk', 'maxHp', 'def', 'cri', 'criMul', 'eva', 'luk', 'kobanMul', 'dropMul']
  const lower: Array<keyof Stats> = ['intervalMs', 'cooldownMul', 'dmgTakenMul']
  return higher.every(key => after[key] >= before[key]) && lower.every(key => after[key] <= before[key]) ? delta : null
}
export function equipItem(profile: Profile, job: JobId, slot: SlotId, itemId: string | null): { ok: true } | { ok: false; reason: string } {
  const member = profile.party.members[job]
  if (itemId === null) { member.equip[slot] = null; return { ok: true } }
  const item = profile.inventory.find((candidate) => candidate.id === itemId)
  if (!item) return { ok: false, reason: '持っていない装備です' }
  if (item.slot !== slot) return { ok: false, reason: '装備する場所が違います' }
  const check = equipCheck(profile, job, item)
  if (!check.ok) return check
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
  profile.koban = cappedAmount(profile.koban + koban); profile.stats.totalKoban = cappedAmount(profile.stats.totalKoban + koban)
  return { ok: true, koban }
}
export interface ItemSale { item: Item; reason: 'auto' | 'capacity'; koban: number }
/** Auto-equip → auto-sell → inventory cap. Records the actual sold item, including displaced inventory. */
export function receiveItem(profile: Profile, item: Item, holdForReview = false, activeJobs = deployedJobs(profile.party.order)): { equippedBy?: JobId; sold: boolean; sale?: ItemSale } {
  profile.inventory.push(item)
  const best = profile.options.autoEquip && !holdForReview
    ? activeJobs.map((job) => ({ job, delta: automaticUpgrade(profile, job, item) }))
      .filter((entry): entry is { job: JobId; delta: number } => entry.delta !== null && entry.delta > 0)
      .sort((a, z) => z.delta - a.delta)[0]
    : undefined
  const limit = profile.options.autoSellMaxRarity
  if (!holdForReview && !best && limit !== null && item.rarity <= limit && !item.locked) {
    const result = sellItems(profile, [item.id])
    if (!result.ok) throw new Error(result.reason)
    return { sold: true, sale: { item, reason: 'auto', koban: result.koban } }
  }
  let sale: ItemSale | undefined
  if (profile.inventory.length > ib.inventoryMax) {
    // Make room before equipping: otherwise a full, locked bag can grow past the cap.
    const spare = profile.inventory.filter((candidate) => (!best || candidate.id !== item.id) && !candidate.locked && !ownerOf(profile, candidate.id))
      .sort((a, z) => a.rarity - z.rarity || a.ilvl - z.ilvl)[0]
    const target = spare ?? item
    const result = sellItems(profile, [target.id])
    if (!result.ok) throw new Error(result.reason)
    sale = { item: target, reason: 'capacity', koban: result.koban }
    if (target === item) return { sold: true, sale }
  }
  if (best) { equipItem(profile, best.job, item.slot, item.id); item.isNew = true; return { equippedBy: best.job, sold: false, ...(sale ? { sale } : {}) } }
  return { sold: false, ...(sale ? { sale } : {}) }
}
/** Drop chance for one defeated enemy, with dojo, gear dropPct and the pachipro's LUK (03 §3.1). */
export function dropChance(profile: Profile, boss: boolean, activeJobs = deployedJobs(profile.party.order)) {
  if (boss) return 1
  const gear = gearMap(profile)
  const dropPct = activeJobs.reduce((sum, job) => sum + statsOf(profile, job, gear[job]).dropMul - 1, 0)
  const pachiLuk = activeJobs.includes('pachipro') ? statsOf(profile, 'pachipro', gear.pachipro).luk : 0
  return ib.dropChance * (1 + dojoDefs.drop.per * profile.dojo.drop + dropPct) * (1 + pachiLuk * ib.pachiLukDrop)
}
export const partyLuk = (profile: Profile, activeJobs = deployedJobs(profile.party.order)) => activeJobs.reduce((sum, job) => sum + statsOf(profile, job).luk, 0)
