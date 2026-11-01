import { attributeKeys, type AttributeKey } from './data/attributes.ts'
import { availablePoints, resetAllocation, spendAuto } from './progress/attributes.ts'
import { REAL_TICK_MS } from './data/timing.ts'
import { recordAbyssClear } from './progress/abyss.ts'
import { DefeatTracker } from './progress/defeat.ts'
import { withdrawDojoRefund } from './progress/dojoRefund.ts'
import { cappedAmount, difficulties, maxFloor, type Difficulty } from './data/dungeon.ts'
import { rarities, type Rarity, type SlotId } from './data/items.ts'
import { partyOrder } from './data/jobs.ts'
import { dojo as dojoDefs, progressBalance as pb, type DojoKey } from './data/progress.ts'
import { equipItem, gearMap, ownerOf, reconcileEquipment, sellItems } from './progress/items.ts'
import { applyRewards, buyDojo, claimOffline, closeMinute, freezePendingOffline, levels, type Profile } from './progress/profile.ts'
import type { JobId, SimEvent, World } from './sim/types.ts'
import { createWorld, refreshParty, requestOrder, requestStage, returnToTown, step } from './sim/world.ts'

/** World + Profile wired together. Shared by the Electron main loop and the headless simulator. */
interface AutoFarmState { depthRank: Difficulty; wallStage: number; requiredClears: number; retrying: boolean }
export interface Game { world: World; profile: Profile; autoFarmClears: number; autoFarmState: AutoFarmState | null; playMsRemainder: number; defeatTracker: DefeatTracker }
export function recoveryStatus(game: Game) {
  const state = game.autoFarmState
  return state && state.depthRank === game.world.depthRank
    ? { wallStage: state.wallStage, requiredClears: state.requiredClears, completedClears: game.autoFarmClears, retrying: state.retrying }
    : undefined
}
function resetAutoFarm(game: Game) { game.autoFarmClears = 0; game.autoFarmState = null }
export type Command =
  | { c: 'setLoop'; loop: boolean }
  | { c: 'selectStage'; stageNo: number; depthRank?: Difficulty }
  | { c: 'returnTown' }
  | { c: 'reorderParty'; order: JobId[] }
  | { c: 'buyDojo'; key: DojoKey }
  | { c: 'claimOffline' }
  | { c: 'claimDojoRefund' }
  | { c: 'equip'; job: JobId; slot: SlotId; itemId: string | null }
  | { c: 'sell'; itemIds: string[] }
  | { c: 'sellAll'; maxRarity: Rarity }
  | { c: 'lock'; itemId: string; locked: boolean }
  | { c: 'allocateStats'; job: JobId; key: AttributeKey; points: number }
  | { c: 'setAutoStats'; job: JobId; enabled: boolean }
  | { c: 'resetStats'; job: JobId }
  | { c: 'markSeen' }
  | { c: 'markItemSeen'; itemId: string }
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
  return { world, profile, autoFarmClears: 0, autoFarmState: null, playMsRemainder: 0, defeatTracker: new DefeatTracker() }
}
export function advance(game: Game, elapsedMs = REAL_TICK_MS): { events: SimEvent[]; changed: boolean; stageCleared: boolean } {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > pb.minuteMs) throw new Error('Invalid simulation step elapsed time')
  const { world, profile } = game
  const events = step(world)
  game.defeatTracker.observe(profile, world, events)
  profile.offlineJobs = actualJobs(world)
  for (const event of events) {
    if (event.t === 'phase' && event.phase === 'stageClear' && (event.depthRank ?? world.depthRank) === 2) recordAbyssClear(profile, event.stageNo, profile.offlineJobs)
  }
  const result = applyRewards(profile, events, profile.offlineJobs)
  if (result.levelsChanged) refresh(game)
  // The first retreat still needs three wipes. A failed prepared retry extends farming immediately.
  const state = game.autoFarmState
  const retryFailed = state?.retrying && state.depthRank === world.depthRank && state.wallStage === world.stageNo
  if (!profile.progress.loop && (world.loop || retryFailed) && events.some((event) => event.t === 'phase' && event.phase === 'wipe')) {
    if (world.pending.stageNo !== undefined) {
      // A deliberate destination also takes priority over the emergency farming mode.
      world.loop = profile.progress.loop; resetAutoFarm(game)
    } else if (world.stageNo > 1) {
      if (retryFailed) state.requiredClears = Math.min(pb.autoFarmMaxClears, state.requiredClears * 2)
      else if (!state || state.depthRank !== world.depthRank) game.autoFarmState = {
        depthRank: world.depthRank, wallStage: world.stageNo, requiredClears: pb.autoFarmClears, retrying: false,
      }
      game.autoFarmState!.retrying = false; game.autoFarmClears = 0; world.loop = true
      requestStage(world, world.stageNo - 1)
    } else {
      // B1 has no farming floor. Keep normal attempts, so its first clear can advance to B2.
      world.loop = false; world.wipeStreak = 0; resetAutoFarm(game)
    }
  }
  if (result.stageCleared && game.autoFarmState && !profile.progress.loop) {
    const recovery = game.autoFarmState
    if (world.depthRank === recovery.depthRank && world.stageNo >= recovery.wallStage) {
      world.loop = false; resetAutoFarm(game)
    } else if (world.loop && world.depthRank === recovery.depthRank && world.pending.stageNo === undefined) {
      if (++game.autoFarmClears >= recovery.requiredClears) {
        world.loop = false; world.wipeStreak = 0; recovery.retrying = true
      }
    }
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
  profile.rates.elapsedMs += elapsedMs
  while (profile.rates.elapsedMs + 1e-8 >= pb.minuteMs) { profile.rates.elapsedMs = Math.max(0, profile.rates.elapsedMs - pb.minuteMs); closeMinute(profile) }
}
export function runCommand(game: Game, command: Command): CommandResult & { events?: SimEvent[] } {
  const { world, profile } = game
  switch (command.c) {
    case 'claimDojoRefund': {
      const refund = withdrawDojoRefund(profile.dojoRefund, profile.koban)
      if (!refund.amount) return { ok: false, reason: '返金残額がないか、所持小判に空きがありません。' }
      profile.koban = refund.koban; profile.dojoRefund = refund.record
      return { ok: true }
    }
    case 'setLoop':
      if (game.autoFarmState && world.pending.stageNo !== undefined) {
        // This pending retreat belongs to recovery; a user-selected destination already resets that state.
        delete world.pending.stageNo; delete world.pending.depthRank
      }
      profile.progress.loop = command.loop; world.loop = command.loop; world.wipeStreak = 0; resetAutoFarm(game)
      return { ok: true }
    case 'returnTown': {
      const events = returnToTown(world)
      game.defeatTracker.observe(profile, world, events)
      profile.offlineJobs = actualJobs(world)
      applyRewards(profile, events, profile.offlineJobs); world.loop = profile.progress.loop; resetAutoFarm(game)
      return { ok: true, events }
    }
    case 'selectStage': {
      const rank = command.depthRank ?? profile.progress.depthRank
      if (!Number.isInteger(rank) || rank < 0 || rank >= difficulties.length || !Number.isSafeInteger(command.stageNo)
        || command.stageNo < 1 || command.stageNo > Math.min(maxFloor(rank), profile.progress.unlockedDepths[rank])) return { ok: false, reason: 'まだ解放されていない階層・難易度です' }
      if (world.phase !== 'town' && command.stageNo === world.stageNo && rank === world.depthRank) {
        if (game.autoFarmState && world.pending.stageNo !== undefined) {
          // Retry this wall now: cancel only the automatic retreat, without restarting the current wave.
          delete world.pending.stageNo; delete world.pending.depthRank
          world.loop = profile.progress.loop; world.wipeStreak = 0; resetAutoFarm(game)
        }
        return { ok: true }
      }
      const immediate = world.phase === 'town' || world.phase === 'walking'
      requestStage(world, command.stageNo, rank); world.loop = profile.progress.loop; resetAutoFarm(game)
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
    case 'markItemSeen': {
      const item = profile.inventory.find(item => item.id === command.itemId)
      if (!item) return { ok: false, reason: '持っていない装備です' }
      if (ownerOf(profile, item.id)) return { ok: false, reason: '装備中の品は保留できません。持ち物を確認してください。' }
      item.isNew = false
      return { ok: true }
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
