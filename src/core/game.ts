import { attributeKeys, type AttributeKey } from './data/attributes.ts'
import { availablePoints, resetAllocation, spendAuto } from './progress/attributes.ts'
import { REAL_TICK_MS } from './data/timing.ts'
import { recordAbyssClear } from './progress/abyss.ts'
import { cappedAmount, difficulties, maxFloor, type Difficulty } from './data/dungeon.ts'
import { rarities, type Rarity, type SlotId } from './data/items.ts'
import { partyOrder } from './data/jobs.ts'
import { dojo as dojoDefs, progressBalance as pb, type DojoKey } from './data/progress.ts'
import { equipItem, gearMap, ownerOf, reconcileEquipment, sellItems } from './progress/items.ts'
import { applyRewards, buyDojo, claimOffline, closeMinute, freezePendingOffline, levels, type Profile } from './progress/profile.ts'
import type { JobId, SimEvent, World } from './sim/types.ts'
import { createWorld, refreshParty, requestOrder, requestStage, returnToTown, step } from './sim/world.ts'

/** World + Profile wired together. Shared by the Electron main loop and the headless simulator. */
export interface Game { world: World; profile: Profile; autoFarmClears: number; minuteMs: number; playMsRemainder: number }
export type Command =
  | { c: 'setLoop'; loop: boolean }
  | { c: 'selectStage'; stageNo: number; depthRank?: Difficulty }
  | { c: 'returnTown' }
  | { c: 'reorderParty'; order: JobId[] }
  | { c: 'buyDojo'; key: DojoKey }
  | { c: 'claimOffline' }
  | { c: 'equip'; job: JobId; slot: SlotId; itemId: string | null }
  | { c: 'sell'; itemIds: string[] }
  | { c: 'sellAll'; maxRarity: Rarity }
  | { c: 'lock'; itemId: string; locked: boolean }
  | { c: 'allocateStats'; job: JobId; key: AttributeKey; points: number }
  | { c: 'setAutoStats'; job: JobId; enabled: boolean }
  | { c: 'resetStats'; job: JobId }
  | { c: 'markSeen' }
  | { c: 'setOptions'; autoEquip?: boolean; autoSellMaxRarity?: Rarity | null }
export type CommandResult = { ok: true } | { ok: false; reason: string }

const actualJobs = (world: World): JobId[] => world.units.filter(unit => unit.side === 'ally').map(unit => unit.defId as JobId)
const allocationMap = (profile: Profile) => Object.fromEntries(partyOrder.map((job) => [job, profile.party.members[job].allocated]))
const refresh = (game: Game) => { reconcileEquipment(game.profile); refreshParty(game.world, levels(game.profile), game.profile.dojo, gearMap(game.profile), allocationMap(game.profile)) }

export function createGame(profile: Profile, seed: number): Game {
  freezePendingOffline(profile)
  const world = createWorld({ seed, stageNo: profile.progress.currentStage, levels: levels(profile), order: profile.party.order,
    dojo: profile.dojo, gear: gearMap(profile), allocated: allocationMap(profile), loop: profile.progress.loop, depthRank: profile.progress.depthRank, dungeonSeed: profile.dungeonSeed, eventDepths: profile.progress.eventDepths })
  if (profile.progress.inTown) returnToTown(world)
  profile.offlineJobs = actualJobs(world)
  return { world, profile, autoFarmClears: 0, minuteMs: 0, playMsRemainder: 0 }
}
export function advance(game: Game, elapsedMs = REAL_TICK_MS): { events: SimEvent[]; changed: boolean; stageCleared: boolean } {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > pb.minuteMs) throw new Error('Invalid simulation step elapsed time')
  const { world, profile } = game
  const events = step(world)
  profile.offlineJobs = actualJobs(world)
  for (const event of events) {
    if (event.t === 'phase' && event.phase === 'stageClear' && (event.depthRank ?? world.depthRank) === 2) recordAbyssClear(profile, event.stageNo, profile.offlineJobs)
  }
  const result = applyRewards(profile, events, profile.offlineJobs)
  if (result.levelsChanged) refresh(game)
  // 3 wipes in a row turn on world.loop; step back to the last cleared stage to farm, then retry.
  const autoLoop = world.loop && !profile.progress.loop
  if (autoLoop && world.stageNo > 1 && events.some((event) => event.t === 'phase' && event.phase === 'wipe')) requestStage(world, world.stageNo - 1)
  if (result.stageCleared && world.loop && !profile.progress.loop && world.stageNo < profile.progress.unlockedStage) {
    if (++game.autoFarmClears >= pb.autoFarmClears) { world.loop = false; world.wipeStreak = 0; game.autoFarmClears = 0 }
  }
  accountElapsed(game, elapsedMs)
  return { events: result.events.length ? [...events, ...result.events] : events, changed: result.changed || result.levelsChanged, stageCleared: result.stageCleared }
}
/** Account for real active time even when a host discards excess simulation backlog. */
export function accountElapsed(game: Game, elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > pb.minuteMs) throw new Error('Invalid active elapsed time')
  const { world, profile } = game
  if (world.phase !== 'town') {
    const elapsed = game.playMsRemainder + elapsedMs
    const wholeMs = Math.floor(elapsed + 1e-8)
    profile.stats.playMs = cappedAmount(profile.stats.playMs + wholeMs)
    game.playMsRemainder = elapsed - wholeMs
  }
  game.minuteMs += elapsedMs
  while (game.minuteMs + 1e-8 >= pb.minuteMs) { game.minuteMs = Math.max(0, game.minuteMs - pb.minuteMs); closeMinute(profile) }
}
export function runCommand(game: Game, command: Command): CommandResult & { events?: SimEvent[] } {
  const { world, profile } = game
  switch (command.c) {
    case 'setLoop':
      profile.progress.loop = command.loop; world.loop = command.loop; world.wipeStreak = 0; game.autoFarmClears = 0
      return { ok: true }
    case 'returnTown': {
      const events = returnToTown(world)
      profile.offlineJobs = actualJobs(world)
      applyRewards(profile, events, profile.offlineJobs); game.autoFarmClears = 0
      return { ok: true, events }
    }
    case 'selectStage': {
      const rank = command.depthRank ?? profile.progress.depthRank
      if (!Number.isInteger(rank) || rank < 0 || rank >= difficulties.length || !Number.isSafeInteger(command.stageNo)
        || command.stageNo < 1 || command.stageNo > Math.min(maxFloor(rank), profile.progress.unlockedDepths[rank])) return { ok: false, reason: 'まだ解放されていない階層・難易度です' }
      const immediate = world.phase === 'town' || world.phase === 'walking'
      requestStage(world, command.stageNo, rank); world.loop = profile.progress.loop; game.autoFarmClears = 0
      if (immediate) { profile.progress.depthRank = rank; profile.progress.currentStage = command.stageNo; profile.progress.unlockedStage = profile.progress.unlockedDepths[rank]; profile.progress.inTown = false }
      return { ok: true }
    }
    case 'reorderParty':
      if (command.order.length !== partyOrder.length || !partyOrder.every((id) => command.order.includes(id))) return { ok: false, reason: '隊列が正しくありません' }
      freezePendingOffline(profile)
      profile.party.order = [...command.order]; requestOrder(world, command.order)
      profile.offlineJobs = actualJobs(world)
      return { ok: true }
    case 'buyDojo': {
      if (!(command.key in dojoDefs)) return { ok: false, reason: '不明な強化です' }
      const result = buyDojo(profile, command.key)
      if (result.ok) refresh(game)
      return result
    }
    case 'claimOffline': {
      if (!profile.pendingOffline) return { ok: false, reason: '受け取れる報酬はありません' }
      const events = claimOffline(profile)
      refresh(game)
      return { ok: true, events }
    }
    case 'equip': {
      const result = equipItem(profile, command.job, command.slot, command.itemId)
      if (result.ok) refresh(game)
      return result
    }
    case 'sell': {
      const result = sellItems(profile, command.itemIds)
      return result.ok ? { ok: true } : result
    }
    case 'sellAll': {
      const ids = profile.inventory.filter((item) => item.rarity <= command.maxRarity && !item.locked && !ownerOf(profile, item.id)).map((item) => item.id)
      if (!ids.length) return { ok: false, reason: `売れる${rarities[command.maxRarity].name}以下の装備はありません` }
      sellItems(profile, ids)
      return { ok: true }
    }
    case 'lock': {
      const item = profile.inventory.find((candidate) => candidate.id === command.itemId)
      if (!item) return { ok: false, reason: '持っていない装備です' }
      item.locked = command.locked
      return { ok: true }
    }
    case 'allocateStats': {
      const member = profile.party.members[command.job]
      if (!member || !attributeKeys.includes(command.key) || !Number.isSafeInteger(command.points) || command.points < 1 || command.points > availablePoints(member)) return { ok: false, reason: '振り分ける能力・ポイントが正しくありません' }
      member.autoStats = false; member.allocated[command.key] += command.points
      refresh(game); return { ok: true }
    }
    case 'setAutoStats': {
      const member = profile.party.members[command.job]
      if (!member) return { ok: false, reason: '不明なジョブです' }
      member.autoStats = command.enabled; spendAuto(member, command.job); refresh(game)
      return { ok: true }
    }
    case 'resetStats': {
      const member = profile.party.members[command.job]
      if (!member) return { ok: false, reason: '不明なジョブです' }
      resetAllocation(member); refresh(game); return { ok: true }
    }
    case 'markSeen':
      for (const item of profile.inventory) item.isNew = false
      return { ok: true }
    case 'setOptions':
      if (command.autoEquip !== undefined) profile.options.autoEquip = command.autoEquip
      if (command.autoSellMaxRarity !== undefined) profile.options.autoSellMaxRarity = command.autoSellMaxRarity
      return { ok: true }
  }
}
