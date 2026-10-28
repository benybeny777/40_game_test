import { describe, expect, it } from 'vitest'
import { advance, applyRewards, buildView, createGame, createWorld, depthScale, floorFeature, newProfile, runCommand, step, validateProfile, type Profile, type World } from '../../src/core/index.ts'
import { rollItem } from '../../src/core/progress/items.ts'
import { itemBalance } from '../../src/core/data/items.ts'

const enterBattle = (world: World) => { for (let tick = 0; world.phase !== 'battle' && tick < 2000; tick++) step(world) }
const unlock = (profile: Profile, rank: 0 | 1 | 2, depth: number) => {
  profile.progress.depthRank = rank; profile.progress.currentStage = depth; profile.progress.unlockedStage = depth
  profile.progress.unlockedDepths = [rank > 0 ? 100 : depth, rank > 1 ? 100 : rank === 1 ? depth : 0, rank === 2 ? depth : 0]
}

describe('黄泉の迷宮・3難度', () => {
  it('通常/修羅は100階、深淵だけ101階以降も安定した値で潜れる', () => {
    expect(() => createWorld({ stageNo: 101 })).toThrow()
    expect(() => createWorld({ stageNo: 101, depthRank: 1 })).toThrow()
    const world = createWorld({ stageNo: Number.MAX_SAFE_INTEGER, depthRank: 2 })
    enterBattle(world)
    expect(world.phase).toBe('battle')
    expect(world.units.every((unit) => Object.values(unit.stats).every(Number.isFinite))).toBe(true)
    expect(Object.values(depthScale(Number.MAX_SAFE_INTEGER, 2)).every(Number.isFinite)).toBe(true)
    expect(() => createWorld({ stageNo: Number.MAX_SAFE_INTEGER + 1, depthRank: 2 })).toThrow()
    expect(() => createWorld({ stageNo: 1.1 })).toThrow()
  })
  it('B100自動進行は次難度B1へ、周回ONでは難度を上げず同階へ戻る', () => {
    for (const rank of [0, 1] as const) {
      const world = createWorld({ stageNo: 100, depthRank: rank }); world.phase = 'stageClear'; world.phaseUntilTick = 0
      step(world)
      expect(world.stageNo).toBe(1); expect(world.depthRank).toBe(rank + 1)
      const farm = createWorld({ stageNo: 100, depthRank: rank, loop: true }); farm.phase = 'stageClear'; farm.phaseUntilTick = 0
      step(farm)
      expect(farm.stageNo).toBe(100); expect(farm.depthRank).toBe(rank)
    }
    const abyss = createWorld({ stageNo: 100, depthRank: 2 }); abyss.phase = 'stageClear'; abyss.phaseUntilTick = 0
    step(abyss); expect(abyss.stageNo).toBe(101); expect(abyss.depthRank).toBe(2)
  })
  it('次難度はB100クリアで解放し、未到達難度と階層への移動を拒否する', () => {
    const profile = newProfile('t'), game = createGame(profile, 1)
    expect(runCommand(game, { c: 'selectStage', stageNo: 1, depthRank: 1 }).ok).toBe(false)
    applyRewards(profile, [{ t: 'phase', phase: 'stageClear', stageNo: 100, wave: 10, depthRank: 0 }])
    expect(profile.progress.unlockedDepths).toEqual([100, 1, 0])
    expect(runCommand(game, { c: 'selectStage', stageNo: 1, depthRank: 1 }).ok).toBe(true)
    expect(runCommand(game, { c: 'selectStage', stageNo: 2, depthRank: 1 }).ok).toBe(false)
    expect(runCommand(game, { c: 'selectStage', stageNo: 100, depthRank: 0 }).ok).toBe(true)
  })
  it('街へ帰還すると戦闘・弾・罠を止め全快し、装備と進行を保って再出発する', () => {
    const profile = newProfile('t'); unlock(profile, 0, 5)
    const game = createGame(profile, 1); enterBattle(game.world)
    profile.koban = 123; game.world.units[0].hp = 1
    expect(runCommand(game, { c: 'returnTown' }).ok).toBe(true)
    expect(game.world.phase).toBe('town')
    expect(game.world.units).toHaveLength(3)
    expect(game.world.units.every((unit) => unit.hp === unit.stats.maxHp)).toBe(true)
    expect(game.world.projectiles).toEqual([]); expect(game.world.mines).toEqual([])
    for (let tick = 0; tick < 1000; tick++) advance(game)
    expect(game.world.phase).toBe('town'); expect(profile.koban).toBe(123)
    const restored = createGame(validateProfile(JSON.parse(JSON.stringify(profile))), 1)
    expect(restored.world.phase).toBe('town')
    expect(runCommand(game, { c: 'selectStage', stageNo: 3 }).ok).toBe(true)
    expect(game.world.phase).toBe('walking'); expect(game.world.stageNo).toBe(3)
    expect(profile.progress.inTown).toBe(false)
  })
  it('宝箱はseedで再現し、帰還・再読込・同階周回で二重取りしない', () => {
    const depth = Array.from({ length: 100 }, (_, index) => index + 1).find((floor) => floorFeature(floor, 1) === 'treasure')!
    const profile = newProfile('t'); unlock(profile, 0, depth)
    const game = createGame(profile, 1)
    const events = []
    for (let tick = 0; game.world.phase !== 'battle' && tick < 2000; tick++) events.push(...advance(game).events)
    expect(events.some((event) => event.t === 'floorEvent' && event.kind === 'treasure')).toBe(true)
    expect(profile.stats.drops).toBe(1)
    runCommand(game, { c: 'returnTown' })
    const restored = createGame(validateProfile(JSON.parse(JSON.stringify(profile))), 1)
    runCommand(restored, { c: 'selectStage', stageNo: depth })
    for (let tick = 0; restored.world.phase !== 'battle' && tick < 2000; tick++) advance(restored)
    expect(restored.profile.stats.drops).toBe(1)
    expect(floorFeature(depth, 1)).toBe('treasure')
  })
  it('祭壇は既存healイベントを出し、傷ついた出撃メンバーを回復する', () => {
    const depth = Array.from({ length: 100 }, (_, index) => index + 1).find((floor) => floorFeature(floor, 1) === 'altar')!
    const world = createWorld({ stageNo: depth }); world.units[0].hp = 1
    const events = []
    for (let tick = 0; world.phase === 'walking' && tick < 100; tick++) events.push(...step(world))
    expect(events.some((event) => event.t === 'floorEvent' && event.kind === 'altar')).toBe(true)
    expect(events.some((event) => event.t === 'heal')).toBe(true)
    expect(world.units[0].hp).toBeGreaterThan(world.units[0].stats.maxHp / 2)
  })
  it('無限深度の一覧・所持装備のtier・テーマは有界で、別ダンジョン記録を保持する', () => {
    const profile = newProfile('t'); unlock(profile, 2, Number.MAX_SAFE_INTEGER)
    profile.dungeonRecords.future = { ...profile.progress, currentStage: 7 }
    const restored = validateProfile(JSON.parse(JSON.stringify(profile))), view = buildView(restored, false)
    expect(view.dungeon.floorLimit).toBeNull(); expect(view.dungeon.depth).toBe(Number.MAX_SAFE_INTEGER)
    expect(view.stages.length).toBeLessThanOrEqual(13)
    expect(view.stage.label).toBe(`B${Number.MAX_SAFE_INTEGER}`)
    expect(restored.dungeonRecords.future.currentStage).toBe(7)
    const item = rollItem({ rng: 1 }, 't', { ilvl: Number.MAX_SAFE_INTEGER, luk: 0, jobs: ['samurai'] })
    expect(item.ilvl).toBe(itemBalance.maxIlvl)
    expect(Number.isFinite(item.atk + item.hp + item.def)).toBe(true)
  })
})
