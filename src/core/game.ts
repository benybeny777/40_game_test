import { balance as b } from './data/balance.ts'
import { partyOrder } from './data/jobs.ts'
import { dojo as dojoDefs, progressBalance as pb, type DojoKey } from './data/progress.ts'
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
export type CommandResult = { ok: true } | { ok: false; reason: string }


export function createGame(profile: Profile, seed: number): Game {
  const world = createWorld({ seed, stageNo: profile.progress.currentStage, levels: levels(profile), order: profile.party.order,
    dojo: profile.dojo, loop: profile.progress.loop, maxStage: b.maxStage })
  return { world, profile, autoFarmClears: 0, minuteTicks: 0 }
}
export function advance(game: Game): { events: SimEvent[]; changed: boolean; stageCleared: boolean } {
  const { world, profile } = game
  const events = step(world)
  const result = applyRewards(profile, events)
  if (result.levelsChanged) refreshParty(world, levels(profile), profile.dojo)
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
      if (result.ok) refreshParty(world, levels(profile), profile.dojo)
      return result
    }
    case 'claimOffline': {
      if (!profile.pendingOffline) return { ok: false, reason: '受け取れる報酬はありません' }
      const events = claimOffline(profile)
      refreshParty(world, levels(profile), profile.dojo)
      return { ok: true, events }
    }
  }
}
