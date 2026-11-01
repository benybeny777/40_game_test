import { describe, expect, it } from 'vitest'
import { advance, createGame, newProfile, runCommand, validateProfile } from '../../src/core/index.ts'
import { recoveryStatus, type Game } from '../../src/core/game.ts'
import { balance } from '../../src/core/data/balance.ts'

function setup(stageNo = 10) {
  const profile = newProfile('auto-farm', 1)
  profile.progress.currentStage = stageNo; profile.progress.unlockedStage = stageNo
  profile.progress.unlockedDepths[0] = stageNo
  return createGame(profile, 1)
}
function wipe(game: Game) {
  game.world.phase = 'battle'; game.world.spawnIndex = game.world.spawnQueue.length
  for (const unit of game.world.units) if (unit.side === 'ally') { unit.hp = 0; unit.alive = false }
  const result = advance(game)
  expect(result.events.some(event => event.t === 'phase' && event.phase === 'wipe')).toBe(true)
  game.world.phaseUntilTick = game.world.tick
  advance(game)
}
function clear(game: Game) {
  game.world.phase = 'waveClear'; game.world.wave = balance.waves; game.world.phaseUntilTick = game.world.tick
  expect(advance(game).stageCleared).toBe(true)
  game.world.phaseUntilTick = game.world.tick
  advance(game)
}
function retreat(game: Game) { for (let n = 0; n < balance.wipeLoopThreshold; n++) wipe(game) }

describe('automatic recovery from a repeated wall', () => {
  it('prepares 2, 4, 8, 8 clears and resets after actually defeating the wall', () => {
    const game = setup(); retreat(game)
    expect(game.world.stageNo).toBe(9)
    for (const requiredClears of [2, 4, 8, 8]) {
      expect(recoveryStatus(game)).toEqual({ wallStage: 10, requiredClears, completedClears: 0, retrying: false })
      for (let n = 0; n < requiredClears; n++) {
        clear(game)
        expect(game.world.stageNo).toBe(n === requiredClears - 1 ? 10 : 9)
      }
      expect(game.world.loop).toBe(false)
      expect(recoveryStatus(game)?.retrying).toBe(true)
      wipe(game)
      expect(game.world.stageNo).toBe(9)
    }
    for (let n = 0; n < 8; n++) clear(game)
    clear(game)
    expect(game.world.stageNo).toBe(11)
    expect(recoveryStatus(game)).toBeUndefined()
    expect(game.profile.progress.loop).toBe(false)
  })
  it('a failed farming floor discards its partial preparation and retreats farther', () => {
    const game = setup(); retreat(game); clear(game); wipe(game)
    expect(game.world.stageNo).toBe(8)
    expect(recoveryStatus(game)).toEqual({ wallStage: 10, requiredClears: 2, completedClears: 0, retrying: false })
    clear(game); clear(game)
    expect(game.world.stageNo).toBe(9)
    clear(game)
    expect(game.world.stageNo).toBe(10)
    expect(recoveryStatus(game)?.wallStage).toBe(10)
  })
  it('B1 has no previous farming floor and advances after the first victory', () => {
    const game = setup(1); retreat(game)
    expect(game.world.loop).toBe(false)
    expect(recoveryStatus(game)).toBeUndefined()
    clear(game)
    expect(game.world.stageNo).toBe(2)
  })
  it.each(['town', 'move', 'manual-loop', 'advance'] as const)('explicit %s clears the recovery plan', command => {
    const game = setup(); retreat(game)
    if (command === 'town') runCommand(game, { c: 'returnTown' })
    else if (command === 'move') runCommand(game, { c: 'selectStage', stageNo: 5 })
    else runCommand(game, { c: 'setLoop', loop: command === 'manual-loop' })
    expect(recoveryStatus(game)).toBeUndefined()
    expect(game.autoFarmClears).toBe(0)
    expect(game.world.loop).toBe(command === 'manual-loop')
    expect(game.profile.progress.loop).toBe(command === 'manual-loop')
  })
  it('a reserved destination wins over a failed prepared retry', () => {
    const game = setup(); retreat(game); clear(game); clear(game)
    game.world.phase = 'battle'
    runCommand(game, { c: 'selectStage', stageNo: 4 })
    game.world.wipeStreak = balance.wipeLoopThreshold - 1
    wipe(game)
    expect(game.world.stageNo).toBe(4)
    expect(game.world.loop).toBe(false)
    expect(recoveryStatus(game)).toBeUndefined()
  })
  it('manual loop changes cancel an automatic retreat waiting at the wipe boundary', () => {
    const game = setup()
    game.world.phase = 'battle'; game.world.wipeStreak = balance.wipeLoopThreshold - 1
    for (const unit of game.world.units) if (unit.side === 'ally') { unit.hp = 0; unit.alive = false }
    advance(game)
    expect(game.world.pending.stageNo).toBe(9)
    runCommand(game, { c: 'setLoop', loop: true })
    expect(game.world.pending.stageNo).toBeUndefined()
    game.world.phaseUntilTick = game.world.tick; advance(game)
    expect(game.world.stageNo).toBe(10)
    expect(game.world.loop).toBe(true)
  })
  it('selecting the current wall cancels its automatic retreat without restarting the wave', () => {
    const game = setup()
    game.world.phase = 'battle'; game.world.wave = 7; game.world.wipeStreak = balance.wipeLoopThreshold - 1
    for (const unit of game.world.units) if (unit.side === 'ally') { unit.hp = 0; unit.alive = false }
    advance(game)
    expect(game.world.pending.stageNo).toBe(9)
    const { phase, wave, phaseUntilTick } = game.world
    expect(runCommand(game, { c: 'selectStage', stageNo: 10 })).toEqual({ ok: true })
    expect(game.world.pending.stageNo).toBeUndefined()
    expect(game.world.pending.depthRank).toBeUndefined()
    expect(game.world).toMatchObject({ phase, wave, phaseUntilTick, loop: false, wipeStreak: 0 })
    expect(recoveryStatus(game)).toBeUndefined()
    game.world.phaseUntilTick = game.world.tick; advance(game)
    expect(game.world.stageNo).toBe(10)
  })
  it('selecting the current floor leaves an existing manual destination untouched', () => {
    const game = setup(); game.world.phase = 'battle'; game.world.wave = 7
    runCommand(game, { c: 'selectStage', stageNo: 4 })
    const before = structuredClone(game.world)
    runCommand(game, { c: 'selectStage', stageNo: 10 })
    expect(game.world).toEqual(before)
  })
  it('recovery stays session-only and never changes the persisted manual loop', () => {
    const game = setup(); retreat(game)
    const restored = createGame(validateProfile(structuredClone(game.profile)), 1)
    expect(restored.autoFarmState).toBeNull()
    expect(restored.world.loop).toBe(false)
    game.world.depthRank = 1
    expect(recoveryStatus(game)).toBeUndefined()
  })
})
