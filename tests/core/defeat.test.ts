import { describe, expect, it } from 'vitest'
import { advance, buildView, createGame, newProfile, runCommand, validateProfile } from '../../src/core/index.ts'
import { DefeatTracker, lastDefeatResolved, validateDefeatRecord } from '../../src/core/progress/defeat.ts'
import { recordAbyssClear } from '../../src/core/progress/abyss.ts'
import type { DungeonId } from '../../src/core/data/dungeon.ts'
import type { SimEvent, Unit } from '../../src/core/sim/types.ts'
import { prepareCloudRestore } from '../../src/shared/cloudProfile.ts'

function setup() {
  const game = createGame(newProfile('2026-11-01T00:00:00Z', 7), 7)
  const allies = [...game.world.units]
  const enemy: Unit = { ...structuredClone(allies[0]), uid: 100, side: 'enemy', defId: 'denno_kyubi', x: 0 }
  game.world.units.push(enemy)
  const tracker = new DefeatTracker()
  const observe = (events: SimEvent[]) => tracker.observe(game.profile, game.world, events)
  const wipe: SimEvent = { t: 'phase', phase: 'wipe', stageNo: 30, depthRank: 0, wave: 10 }
  return { game, allies, enemy, observe, wipe }
}
describe('last defeated wave', () => {
  it('distinguishes reaching a floor from having cleared it, independently of current difficulty', () => {
    const { game, observe, wipe } = setup()
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(false)
    observe([wipe])
    game.profile.progress.unlockedDepths = [30, 0, 0]
    game.profile.progress.currentStage = 30
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(false)
    game.profile.progress.unlockedDepths[0] = 31
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(true)
    game.profile.progress.depthRank = 1
    game.profile.progress.unlockedDepths = [100, 1, 0]
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(true)
  })
  it.each([0, 1] as const)('requires next difficulty unlock as proof of B100 clear for rank %i', rank => {
    const { game, observe, wipe } = setup()
    observe([{ ...wipe, stageNo: 100, depthRank: rank }])
    game.profile.progress.unlockedDepths = rank === 0 ? [100, 0, 0] : [100, 100, 0]
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(false)
    game.profile.progress.unlockedDepths[rank + 1] = 1
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(true)
  })
  it('accepts an actual abyss clear at the last safe floor without requiring a nonexistent next floor', () => {
    const { game, observe, wipe } = setup()
    observe([{ ...wipe, stageNo: Number.MAX_SAFE_INTEGER, depthRank: 2 }])
    game.profile.progress.unlockedDepths = [100, 100, Number.MAX_SAFE_INTEGER]
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(false)
    recordAbyssClear(game.profile, Number.MAX_SAFE_INTEGER, game.profile.offlineJobs)
    expect(buildView(game.profile, false).lastDefeatResolved).toBe(true)
  })
  it('uses only the recorded dungeon progress and refuses malformed present progress', () => {
    const { game, observe, wipe } = setup(); observe([wipe])
    // Exercise future-dungeon separation without adding a new production dungeon definition.
    game.profile.dungeonId = 'future-dungeon' as DungeonId
    game.profile.progress = { ...game.profile.progress, unlockedDepths: [100, 100, 1000] }
    expect(lastDefeatResolved(game.profile)).toBe(false)
    game.profile.dungeonRecords.yomi.unlockedDepths = [31, 0, 0]
    expect(lastDefeatResolved(game.profile)).toBe(true)
    delete game.profile.dungeonRecords.yomi
    expect(lastDefeatResolved(game.profile)).toBe(false)
    game.profile.dungeonRecords.yomi = { ...game.profile.progress, unlockedDepths: [NaN, 0, 0] }
    expect(() => lastDefeatResolved(game.profile)).toThrow('bad recorded dungeon progress')
  })
  it('records real boss damage and simultaneous falls through advance using the fighting party', () => {
    const { game, allies, enemy } = setup()
    game.world.phase = 'battle'
    for (const ally of allies) { ally.hp = 1; ally.stats.eva = 0; ally.base.eva = 0; ally.action = { kind: 'none', untilTick: 999 }; ally.attackReadyTick = 999; ally.skillReadyTick = 999 }
    enemy.hp = 99999; enemy.stats.atk = 99999; enemy.base.atk = 99999
    enemy.action = { kind: 'cast', untilTick: 0, skillId: 'kitsunebi', originX: enemy.x, targetUids: allies.map(ally => ally.uid) }
    const queued = [...game.profile.party.order].reverse()
    runCommand(game, { c: 'reorderParty', order: queued })
    advance(game)
    const record = game.profile.lastDefeat!
    expect(record.party.map(member => member.job)).toEqual(allies.map(ally => ally.defId))
    expect(record.party.map(member => member.job)).not.toEqual(queued.slice(0, 3))
    expect(record.party.map(member => member.fallOrder)).toEqual([1, 1, 1])
    expect(record.party.map(member => member.damageTaken)).toEqual([1, 1, 1])
    expect(record.party.map(member => member.fatalSource?.skillId)).toEqual(['kitsunebi', 'kitsunebi', 'kitsunebi'])
    expect(record.floor).toBe(1); expect(record.wave).toBe(1)
    const json = JSON.parse(JSON.stringify(game.profile))
    expect(validateProfile(json).lastDefeat).toEqual(record)
    expect(prepareCloudRestore(json, Date.parse(json.savedAt)).lastDefeat).toEqual(record)
    const view = buildView(game.profile, false)
    view.lastDefeat!.party[0].damageTaken = 999
    expect(record.party[0].damageTaken).toBe(1)
    runCommand(game, { c: 'returnTown' })
    expect(game.profile.lastDefeat).toEqual(record)
  })
  it('retains actual damage but replaces pre-revival falls and does not infer an unobserved fatal source', () => {
    const { game, allies, enemy, observe, wipe } = setup()
    const [first, second, third] = allies
    game.world.tick = 1
    observe([{ t: 'damage', uid: first.uid, sourceUid: enemy.uid, amount: 20, crit: false }, { t: 'death', uid: first.uid }])
    game.world.tick = 2
    observe([{ t: 'revive', uid: first.uid }, { t: 'damage', uid: second.uid, sourceUid: enemy.uid, amount: 30, crit: false }, { t: 'death', uid: second.uid }])
    game.world.tick = 3
    observe([{ t: 'death', uid: first.uid }, { t: 'damage', uid: third.uid, sourceUid: enemy.uid, amount: 40, crit: false, tags: ['kitsunebi'] }, { t: 'death', uid: third.uid }, wipe])
    expect(game.profile.lastDefeat?.party.map(member => member.fallOrder)).toEqual([2, 1, 2])
    expect(game.profile.lastDefeat?.party.map(member => member.damageTaken)).toEqual([20, 30, 40])
    expect(game.profile.lastDefeat?.party[0].fatalSource).toBeNull()
    expect(game.profile.lastDefeat?.party[1].fatalSource?.skillId).toBeNull()
    expect(game.profile.lastDefeat?.party[2].fatalSource?.skillId).toBe('kitsunebi')
  })
  it('clears wave totals, replaces only on the next defeat, and identifies enemy explosions', () => {
    const { game, allies, enemy, observe, wipe } = setup()
    observe([wipe]); const original = structuredClone(game.profile.lastDefeat)
    observe([{ t: 'damage', uid: allies[0].uid, sourceUid: enemy.uid, amount: 100, crit: false }, { t: 'phase', phase: 'walking', stageNo: 31, wave: 1 }])
    expect(game.profile.lastDefeat).toEqual(original)
    enemy.defId = 'popuponi'
    observe([{ t: 'damage', uid: allies[0].uid, sourceUid: enemy.uid, amount: 10, crit: false, tags: ['explode'] }, { t: 'death', uid: allies[0].uid }, { ...wipe, stageNo: 31 }])
    expect(game.profile.lastDefeat?.floor).toBe(31)
    expect(game.profile.lastDefeat?.party[0].damageTaken).toBe(10)
    expect(game.profile.lastDefeat?.party[0].fatalSource?.skillId).toBe('explode')
  })
  it('only migrates absent old records and explicit null to no record', () => {
    const raw = JSON.parse(JSON.stringify(newProfile('2026-11-01T00:00:00Z')))
    delete raw.lastDefeat
    expect(validateProfile(raw).lastDefeat).toBeNull()
    expect(validateDefeatRecord(null)).toBeNull()
  })
  it.each(['party', 'job', 'rank', 'damage', 'source', 'skill', 'floor', 'dungeon'])('rejects malformed saved defeat %s', field => {
    const { game, observe, wipe } = setup(); observe([wipe])
    const raw = JSON.parse(JSON.stringify(game.profile))
    const record = raw.lastDefeat, member = record.party[0]
    if (field === 'party') record.party.push(record.party[0])
    if (field === 'job') record.party[1].job = member.job
    if (field === 'rank') member.fallOrder = 3
    if (field === 'damage') member.damageTaken = -1
    if (field === 'source') { member.fallOrder = 1; member.fatalSource = { enemyId: 'unknown', skillId: null } }
    if (field === 'skill') { member.fallOrder = 1; member.fatalSource = { enemyId: 'chochin', skillId: 'kitsunebi' } }
    if (field === 'floor') record.floor = 101
    if (field === 'dungeon') record.dungeonId = 'unknown'
    const causes: Record<string, string> = { party: 'party must contain exactly', job: 'party[1].job duplicates', rank: 'party.fallOrder must form consecutive',
      damage: 'party[0].damageTaken must be', source: 'party[0].fatalSource.enemyId must identify', skill: 'party[0].fatalSource.skillId must be', floor: 'floor is outside', dungeon: 'dungeonId must identify' }
    expect(() => validateProfile(raw)).toThrow(`bad defeat record: ${causes[field]}`)
  })
  it('constructs the validated schema without retaining unknown keys or references', () => {
    const { game, observe, wipe, allies, enemy } = setup()
    observe([{ t: 'damage', uid: allies[0].uid, sourceUid: enemy.uid, amount: 2, crit: false }, { t: 'death', uid: allies[0].uid }, wipe])
    const raw = JSON.parse(JSON.stringify(game.profile.lastDefeat))
    raw.untrusted = { arbitrary: 'payload' }; raw.party[0].unused = true; raw.party[0].fatalSource.extra = 'ignored'
    const validated = validateDefeatRecord(raw)!
    expect(validated).toEqual(game.profile.lastDefeat)
    raw.party[0].fatalSource.enemyId = 'chochin'; raw.party[0].damageTaken = 999
    expect(validated.party[0].fatalSource?.enemyId).toBe('denno_kyubi')
    expect(validated.party[0].damageTaken).toBe(2)
  })
})
