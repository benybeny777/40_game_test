import { describe, expect, it } from 'vitest'
import { advance, balance, buildView, createGame, newProfile, runCommand, validateProfile } from '../../src/core/index.ts'
import { ABYSS_HISTORY_LIMIT, nextAbyssGoal, recordAbyssClear, validateAbyssRecords } from '../../src/core/progress/abyss.ts'
import { prepareCloudRestore } from '../../src/shared/cloudProfile.ts'

function abyssGame() {
  const profile = newProfile('2026-10-30T00:00:00Z', 7)
  profile.progress.depthRank = 2; profile.progress.currentStage = 100; profile.progress.unlockedStage = 100
  profile.progress.unlockedDepths = [100, 100, 100]
  return createGame(profile, 7)
}
function clear(game: ReturnType<typeof abyssGame>) {
  game.world.phase = 'waveClear'; game.world.wave = balance.waves; game.world.phaseUntilTick = game.world.tick
  advance(game)
}
describe('abyss goals and recorded formations', () => {
  it('records only a completed abyss floor and the fighting party, never a queued formation', () => {
    const game = abyssGame(), fighting = game.world.units.filter(unit => unit.side === 'ally').map(unit => unit.defId)
    expect(buildView(game.profile, false).dungeon.abyss.best).toBeNull()
    const next = [...game.profile.party.order].reverse()
    game.world.phase = 'battle'
    runCommand(game, { c: 'reorderParty', order: next })
    clear(game)
    const record = game.profile.abyssRecords.yomi
    expect(record.best?.floor).toBe(100)
    expect(record.best?.party.map(member => member.job)).toEqual(fighting)
    expect(record.best?.party.map(member => member.job)).not.toEqual(next.slice(0, 3))
    expect(record.milestones).toHaveLength(1)
    const snapshot = structuredClone(record)
    game.profile.party.members[fighting[0] as keyof typeof game.profile.party.members].lv = 10
    clear(game)
    expect(record).toEqual(snapshot)
    expect(buildView(game.profile, false).dungeon.abyss.nextGoal).toBe(250)
    game.world.depthRank = 1; game.world.stageNo = 500; clear(game)
    expect(record).toEqual(snapshot)
  })
  it('keeps immutable pre-reward equipment names and bounded chronological milestones', () => {
    const game = abyssGame()
    clear(game)
    // A B100 reward may be auto-equipped; the winning snapshot predates that reward.
    expect(game.profile.abyssRecords.yomi.best?.party.every(member => member.equipment.weapon === null)).toBe(true)
    const active = game.profile.offlineJobs
    for (const floor of [250, 500, ...Array.from({ length: 12 }, (_, index) => (index + 1) * 1000)]) recordAbyssClear(game.profile, floor, active)
    const record = game.profile.abyssRecords.yomi
    expect(record.milestones).toHaveLength(ABYSS_HISTORY_LIMIT)
    expect(record.milestones.map(clear => clear.floor)).toEqual([5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000])
    expect(nextAbyssGoal(record.best!.floor)).toBe(13000)
    expect(nextAbyssGoal(Number.MAX_SAFE_INTEGER)).toBeNull()
    expect(validateAbyssRecords(game.profile.abyssRecords)).toEqual(game.profile.abyssRecords)
  })
  it('round trips saves and imports, while old saves begin without invented historical builds', () => {
    const game = abyssGame(); clear(game)
    const json = JSON.parse(JSON.stringify(game.profile))
    expect(validateProfile(json).abyssRecords).toEqual(game.profile.abyssRecords)
    expect(prepareCloudRestore(json, Date.parse(game.profile.savedAt)).abyssRecords).toEqual(game.profile.abyssRecords)
    delete json.abyssRecords
    const old = validateProfile(json)
    expect(old.abyssRecords).toEqual({})
    expect(buildView(old, false).dungeon.abyss).toEqual({ best: null, milestones: [], nextGoal: 100 })
  })
  it.each(['null', 'unknown dungeon', 'duplicate job', 'bad allocation', 'long history', 'bad floor', 'bad equipment', 'duplicate milestone'])('rejects present malformed data: %s', kind => {
    const game = abyssGame(); clear(game)
    const raw = JSON.parse(JSON.stringify(game.profile))
    const record = raw.abyssRecords.yomi
    if (kind === 'null') raw.abyssRecords = null
    if (kind === 'unknown dungeon') raw.abyssRecords.unknown = record
    if (kind === 'duplicate job') record.best.party[1].job = record.best.party[0].job
    if (kind === 'bad allocation') record.best.party[0].allocated.str = 99999
    if (kind === 'long history') record.milestones = Array(9).fill(record.best)
    if (kind === 'bad floor') record.best.floor = 1.5
    if (kind === 'bad equipment') record.best.party[0].equipment.weapon = 42
    if (kind === 'duplicate milestone') record.milestones.push(record.milestones[0])
    expect(() => validateProfile(raw)).toThrow('bad abyss records')
  })
})
