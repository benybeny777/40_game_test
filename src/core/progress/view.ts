import { attributeDefs, attributeKeys, attributeLabels, type Attributes, type AttributeKey } from '../data/attributes.ts'
import { attributesOf, availablePoints } from './attributes.ts'
import { balance as b } from '../data/balance.ts'
import { effectiveSkill } from '../data/skillEngravings.ts'
import { skillDescription } from '../data/skillDescription.ts'
import { realTickSeconds } from '../sim/time.ts'
import { difficulties, dungeonBalance as db, dungeons, floorFeature, floorLimit, type Difficulty, type FloorFeature } from '../data/dungeon.ts'
import { enemies } from '../data/enemies.ts'
import { itemBalance, rarities, slots, type Rarity, type SlotId } from '../data/items.ts'
import { deployedJobs, jobs, partySize, roleLabels, type JobRole } from '../data/jobs.ts'
import { dojo as dojoDefs, type DojoKey } from '../data/progress.ts'
import { stageLabel } from '../data/stages.ts'
import type { JobId, Stats } from '../sim/types.ts'
import type { World } from '../sim/types.ts'
import { createEquipmentComparison, describe, ownerOf, requirementsOf, sellPrice, statsOf, type Item, type EquipmentEligibility } from './items.ts'
import { activeExperienceMultiplier, dojoCost, expToNext, perMinute, type OfflineResult, type Profile } from './profile.ts'
import { abyssView, type AbyssView } from './abyss.ts'
import { lastDefeatResolved, type DefeatRecord } from './defeat.ts'

export interface ItemView {
  id: string; name: string; slot: SlotId; slotName: string; job?: JobId; jobName?: string; ilvl: number
  rarity: Rarity; rarityName: string; color: string; lines: string[]; sellPrice: number; locked: boolean; isNew: boolean
  requirements: string[]; rollLabel: string; marketEligible: false; equipable: Record<JobId, EquipmentEligibility>
  skillTradeoff: Partial<Record<JobId, { before?: string; after?: string }>>
  owner?: JobId; delta: Partial<Record<JobId, number>>                 // Omitted for incompatible items and skill tradeoffs.
  comparison: Partial<Record<JobId, Partial<Record<keyof Stats, { before: number; after: number }>>>>
}
export interface MemberView {
  experienceMultiplier: number
  active: boolean; fighting: boolean; job: JobId; name: string; role: string; roleId: JobRole; color: string; lv: number; exp: number; expNext: number
  attributes: Attributes; baseAttributes: Attributes; allocated: Attributes; availablePoints: number; autoStats: boolean; mainAttribute: AttributeKey; autoWeights: Attributes
  // interval is the scheduled attack interval in real seconds, including combat-tick rounding.
  stats: { hp: number; atk: number; def: number; interval: number; cri: number; eva: number; luk: number; range: string }
  skills: Array<{ kind: '通常' | 'スキル' | 'パッシブ' | '奥義'; name: string; desc: string; unlockLv: number; unlocked: boolean }>
  equip: Record<SlotId, ItemView | null>
}
export interface ProfileView {
  lastDefeat: DefeatRecord | null
  lastDefeatResolved: boolean
  dungeon: { id: string; name: string; depth: number; best: number; difficulty: Difficulty; difficultyLabel: string; unlockedDifficulty: number; unlockedDepths: [number, number, number]; recovery?: { wallStage: number; requiredClears: number; completedClears: number; retrying: boolean }; floorLimit: number | null; town: boolean; theme: string; pendingTravel?: { depth: number; difficulty: Difficulty }; floorEvent: { kind: FloorFeature; claimed: boolean }; abyss: AbyssView }
  koban: number; totalKoban: number
  stage: { current: number; unlocked: number; label: string; areaName: string; loop: boolean; max: number }
  partySize: number
  formationPending: boolean
  party: MemberView[]
  inventory: ItemView[]
  reserveEquipment: ItemView[]
  inventoryMax: number
  inventoryCount: number
  options: Profile['options']
  rarityNames: string[]
  dojo: Array<{ key: DojoKey; name: string; desc: string; level: number; max: number | null; cost: number; affordable: boolean }>
  stages: Array<{ no: number; label: string; areaName: string; unlocked: boolean; current: boolean }>
  rates: { kobanPerMin: number; expPerMin: number }
  stats: Profile['stats']
  dex: Array<{ id: string; name: string; desc: string; seen: boolean; boss: boolean; area: number }>
  pendingOffline: OfflineResult | null
}
const round = (value: number, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits

function itemView(profile: Profile, item: Item, compare: ReturnType<typeof createEquipmentComparison>): ItemView {
  const rarity = rarities[item.rarity]
  const checked = compare(item)
  const comparisons = checked.flatMap(({ job, comparison }) => comparison ? [{ job, ...comparison }] : [])
  return { id: item.id, name: item.name, slot: item.slot, slotName: slots[item.slot].name, job: item.job, jobName: item.job ? jobs[item.job].name : undefined,
    ilvl: item.ilvl, rarity: item.rarity, rarityName: rarity.name, color: rarity.color, lines: describe(item), sellPrice: sellPrice(item),
    locked: item.locked, isNew: item.isNew, requirements: attributeKeys.filter((key) => requirementsOf(item)[key] > 0).map((key) => attributeLabels[key] + requirementsOf(item)[key]), rollLabel: `基礎性能${Math.round((item.baseRoll ?? 1) * 100)}%（85〜115%）`, marketEligible: false, equipable: Object.fromEntries(checked.map(({ job, check }) => [job, check])) as ItemView['equipable'], owner: ownerOf(profile, item.id),
    comparison: Object.fromEntries(comparisons.map(({ job, before, after }) => [job,
      Object.fromEntries((Object.keys(before) as Array<keyof Stats>).filter(key => Math.abs(after[key] - before[key]) > .000001)
        .map(key => [key, { before: before[key], after: after[key] }]))])),
    skillTradeoff: Object.fromEntries(comparisons.filter(entry => entry.skillTradeoff).map(({ job, skillTradeoff }) => [job, skillTradeoff])),
    delta: Object.fromEntries(comparisons.flatMap(({ job, delta }) => delta === null ? [] : [[job, round(delta, 1)]])) }
}

export function buildView(profile: Profile, loop: boolean, pending?: World['pending'], recovery?: ProfileView['dungeon']['recovery']): ProfileView {
  const current = stageLabel(profile.progress.currentStage)
  const rate = perMinute(profile)
  const compare = createEquipmentComparison(profile)
  const views = new Map(profile.inventory.map((item) => [item.id, itemView(profile, item, compare)]))
  const rank = profile.progress.depthRank, limit = floorLimit(rank), best = profile.progress.unlockedDepths[rank]
  const visibleFloors = limit === null ? [...new Set([1, best, ...Array.from({ length: db.stageWindow * 2 + 1 }, (_, index) => profile.progress.currentStage - db.stageWindow + index)])].filter((depth) => Number.isSafeInteger(depth) && depth >= 1 && depth <= best).sort((a, z) => a - z)
    : Array.from({ length: limit }, (_, index) => index + 1)
  return {
    lastDefeat: structuredClone(profile.lastDefeat),
    lastDefeatResolved: lastDefeatResolved(profile),
    dungeon: { id: profile.dungeonId, name: dungeons[profile.dungeonId].name, depth: profile.progress.currentStage, best, difficulty: rank,
      pendingTravel: pending?.stageNo === undefined ? undefined : { depth: pending.stageNo, difficulty: pending.depthRank ?? rank },
      recovery: recovery ? { ...recovery } : undefined,
      abyss: abyssView(profile),
      unlockedDepths: [...profile.progress.unlockedDepths],
      difficultyLabel: difficulties[rank].name, unlockedDifficulty: profile.progress.unlockedDepths.reduce((highest, depth, index) => depth > 0 ? index : highest, 0),
      floorLimit: limit, town: profile.progress.inTown, theme: current.areaName,
      floorEvent: { kind: floorFeature(profile.progress.currentStage, profile.dungeonSeed, rank), claimed: profile.progress.currentStage <= profile.progress.eventDepths[rank] } },
    koban: profile.koban, totalKoban: profile.stats.totalKoban,
    stage: { current: profile.progress.currentStage, unlocked: profile.progress.unlockedStage, label: current.label, areaName: current.areaName, loop, max: limit ?? db.maxDepth },
    partySize,
    formationPending: profile.offlineJobs.some((id, index) => profile.party.order[index] !== id),
    party: profile.party.order.map((id) => {
      const job = jobs[id], member = profile.party.members[id], stats = statsOf(profile, id)
      return { active: deployedJobs(profile.party.order).includes(id), fighting: profile.offlineJobs.includes(id), job: id, name: job.name, role: roleLabels[job.role], roleId: job.role, color: job.color, lv: member.lv, exp: member.exp, expNext: expToNext(member.lv), attributes: attributesOf(id, member.allocated), baseAttributes: { ...attributeDefs[id].base }, allocated: { ...member.allocated }, availablePoints: availablePoints(member), autoStats: member.autoStats, mainAttribute: attributeDefs[id].main, autoWeights: { ...attributeDefs[id].auto },
        experienceMultiplier: activeExperienceMultiplier(profile, id, profile.offlineJobs),
        stats: { hp: round(stats.maxHp), atk: round(stats.atk, 1), def: round(stats.def, 1), interval: realTickSeconds(stats.intervalMs),
          cri: round(stats.cri * 100, 1), eva: round(stats.eva * 100, 1), luk: round(stats.luk, 1), range: job.attack.kind === 'melee' ? '近接' : '遠隔' },
        skills: [
          { kind: '通常', name: job.attack.name, desc: `攻撃力×${job.attack.mul}`, unlockLv: 1, unlocked: true },
          { kind: 'スキル', name: job.skill.name, desc: `${skillDescription(effectiveSkill(job.skill, stats))}（${realTickSeconds((job.skill.cooldownMs ?? 0) * stats.cooldownMul)}秒ごと）`, unlockLv: b.skillLv, unlocked: member.lv >= b.skillLv },
          { kind: 'パッシブ', name: job.passive.name, desc: skillDescription(job.passive), unlockLv: b.passiveLv, unlocked: member.lv >= b.passiveLv },
          { kind: '奥義', name: job.ultimate.name, desc: skillDescription(job.ultimate), unlockLv: b.ultLv, unlocked: member.lv >= b.ultLv },
        ],
        equip: Object.fromEntries((Object.keys(slots) as SlotId[]).map((slot) => [slot, member.equip[slot] ? views.get(member.equip[slot]!) ?? null : null])) as MemberView['equip'] }
    }),
    inventory: [...views.values()].filter((item) => !item.owner).sort((a, z) => z.rarity - a.rarity || z.ilvl - a.ilvl),
    reserveEquipment: [...views.values()].filter(item => item.owner && !deployedJobs(profile.party.order).includes(item.owner)),
    inventoryMax: itemBalance.inventoryMax, inventoryCount: profile.inventory.length, options: { ...profile.options }, rarityNames: rarities.map((rarity) => rarity.name),
    dojo: (Object.keys(dojoDefs) as DojoKey[]).map((key) => {
      const def = dojoDefs[key], level = profile.dojo[key], cost = dojoCost(key, level)
      const maxed = def.max !== null && level >= def.max
      return { key, name: def.name, desc: def.desc, level, max: def.max, cost, affordable: !maxed && profile.koban >= cost }
    }),
    stages: visibleFloors.map((no) => {
      const label = stageLabel(no)
      return { no, label: label.label, areaName: label.areaName, unlocked: no <= profile.progress.unlockedStage, current: no === profile.progress.currentStage }
    }),
    rates: { kobanPerMin: round(rate.koban, 1), expPerMin: round(rate.exp, 1) },
    stats: { ...profile.stats },
    dex: Object.values(enemies).filter((enemy) => !enemy.hidden).map((enemy) => ({ id: enemy.id, name: enemy.name, desc: enemy.desc,
      seen: profile.seenEnemies.includes(enemy.id), boss: Boolean(enemy.boss), area: enemy.area })),
    pendingOffline: profile.pendingOffline,
  }
}
