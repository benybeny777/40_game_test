import { balance as b } from './data/balance.ts'
import { rarities, type Rarity, type SlotId } from './data/items.ts'
import { partyOrder } from './data/jobs.ts'
import { dojo as dojoDefs, progressBalance as pb, type DojoKey } from './data/progress.ts'
import { equipItem, gearMap, ownerOf, sellItems } from './progress/items.ts'
import { applyRewards, buyDojo, claimOffline, closeMinute, levels, type Profile } from './progress/profile.ts'
import type { JobId, SimEvent, World } from './sim/types.ts'
import { createWorld, refreshParty, requestOrder, requestStage, step } from './sim/world.ts'

/** World + Profile wired together. Shared by the Electron main loop and the headless simulator. */
export interface Game { world: World; profile: Profile; autoFarmClears: number; minuteTicks: number }
export type Command =
  | { c: 'setLoop'; loop: boolean }
  | { c: 'selectStage'; stageNo: number }
  | { c: 'reorderParty'; order: JobId[] }
  | { c: 'buyDojo'; key: DojoKey }
  | { c: 'claimOffline' }
  | { c: 'equip'; job: JobId; slot: SlotId; itemId: string | null }
  | { c: 'sell'; itemIds: string[] }
  | { c: 'sellAll'; maxRarity: Rarity }
  | { c: 'lock'; itemId: string; locked: boolean }
  | { c: 'markSeen' }
  | { c: 'setOptions'; autoEquip?: boolean; autoSellMaxRarity?: Rarity | null }
export type CommandResult = { ok: true } | { ok: false; reason: string }

const refresh = (game: Game) => refreshParty(game.world, levels(game.profile), game.profile.dojo, gearMap(game.profile))

export function createGame(profile: Profile, seed: number): Game {
  const world = createWorld({ seed, stageNo: profile.progress.currentStage, levels: levels(profile), order: profile.party.order,
    dojo: profile.dojo, gear: gearMap(profile), loop: profile.progress.loop, maxStage: b.maxStage })
  return { world, profile, autoFarmClears: 0, minuteTicks: 0 }
}
export function advance(game: Game): { events: SimEvent[]; changed: boolean; stageCleared: boolean } {
  const { world, profile } = game
  const events = step(world)
  const result = applyRewards(profile, events)
  if (result.levelsChanged) refresh(game)
  // 3 wipes in a row turn on world.loop; step back to the last cleared stage to farm, then retry.
  const autoLoop = world.loop && !profile.progress.loop
  if (autoLoop && world.stageNo > 1 && events.some((event) => event.t === 'phase' && event.phase === 'wipe')) requestStage(world, world.stageNo - 1)
  if (result.stageCleared && world.loop && !profile.progress.loop && world.stageNo < profile.progress.unlockedStage) {
    if (++game.autoFarmClears >= pb.autoFarmClears) { world.loop = false; world.wipeStreak = 0; game.autoFarmClears = 0 }
  }
  profile.stats.playMs += b.tickMs
  if (++game.minuteTicks >= pb.minuteMs / b.tickMs) { game.minuteTicks = 0; closeMinute(profile) }
  return { events: result.events.length ? [...events, ...result.events] : events, changed: result.changed || result.levelsChanged, stageCleared: result.stageCleared }
}
export function runCommand(game: Game, command: Command): CommandResult & { events?: SimEvent[] } {
  const { world, profile } = game
  switch (command.c) {
    case 'setLoop':
      profile.progress.loop = command.loop; world.loop = command.loop; world.wipeStreak = 0; game.autoFarmClears = 0
      return { ok: true }
    case 'selectStage':
      if (!Number.isInteger(command.stageNo) || command.stageNo < 1 || command.stageNo > profile.progress.unlockedStage) return { ok: false, reason: 'まだ解放されていないステージです' }
      requestStage(world, command.stageNo); world.loop = profile.progress.loop; game.autoFarmClears = 0
      return { ok: true }
    case 'reorderParty':
      if (command.order.length !== partyOrder.length || !partyOrder.every((id) => command.order.includes(id))) return { ok: false, reason: '隊列が正しくありません' }
      profile.party.order = [...command.order]; requestOrder(world, command.order)
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
    case 'markSeen':
      for (const item of profile.inventory) item.isNew = false
      return { ok: true }
    case 'setOptions':
      if (command.autoEquip !== undefined) profile.options.autoEquip = command.autoEquip
      if (command.autoSellMaxRarity !== undefined) profile.options.autoSellMaxRarity = command.autoSellMaxRarity
      return { ok: true }
  }
}
