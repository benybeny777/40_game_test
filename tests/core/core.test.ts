import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { balance as b, createWorld, resolveHit, snapshot, step } from '../../src/core/index.ts'
import { chooseTarget } from '../../src/core/sim/combat.ts'
import { random } from '../../src/core/sim/rng.ts'
import type { World, Phase, Stats } from '../../src/core/index.ts'

function advanceTo(world: World, phase: Phase, limit = 2000) {
  for (let count = 0; world.phase !== phase && count < limit; count++) step(world)
  expect(world.phase).toBe(phase)
}
function battle() { const world = createWorld(); advanceTo(world, 'battle'); return world }
function hashRun(seed: number) {
  const world = createWorld({ seed, loop: true })
  const hash = createHash('sha256')
  for (let tick = 0; tick < 600000 / b.tickMs; tick++) {
    step(world, [])
    hash.update(JSON.stringify(snapshot(world)))
  }
  return hash.digest('hex')
}
const plain: Stats = { maxHp: 100, atk: 20, def: 0, intervalMs: 1000, cri: 0, criMul: 1.5, eva: 0, luk: 0, rangeDots: 16, dmgTakenMul: 1, kobanMul: 1, dropMul: 1, cooldownMul: 1 }
describe('命中・計算式', () => {
  it('DEF0・非会心・ばらつきなしではATK×倍率', () => {
    expect(resolveHit(plain, plain, { mul: 2 }, [0.5, 0.5, 0.5], { variance: 0 }).amount).toBe(40)
  })
  it('DEF軽減、会心、最低1、回避、無敵と範囲の判定', () => {
    expect(resolveHit(plain, { ...plain, def: 50 }, { mul: 1 }, [0.5, 0.5, 0.5], { variance: 0 }).amount).toBe(10)
    expect(resolveHit({ ...plain, cri: 1 }, plain, { mul: 1 }, [0.5, 0.5, 0.5], { variance: 0 }).amount).toBe(30)
    expect(resolveHit(plain, plain, { mul: 0 }, [0.5, 0.5, 0.5]).amount).toBe(1)
    expect(resolveHit(plain, { ...plain, eva: 1 }, { mul: 1 }, [0.5, 0.5, 0.5]).missed).toBe(true)
    expect(resolveHit(plain, { ...plain, eva: 1 }, { mul: 1, aoeDots: 10 }, [0.5, 0.5, 0.5]).missed).toBe(false)
    expect(resolveHit(plain, plain, { mul: 1, aoeDots: 10 }, [0.5, 0.5, 0.5], { invulnerable: true }).amount).toBe(0)
  })
  it('河童の会心軽減と執着', () => {
    expect(resolveHit(plain, plain, { mul: 1, forceCrit: true }, [0.5, 0.5, 0.5], { variance: 0, armored: true }).amount).toBe(25)
    expect(resolveHit(plain, plain, { mul: 1 }, [0.5, 0.5, 0.5], { variance: 0, obsession: true }).amount).toBe(23)
  })
})
describe('固定ティックと状態', () => {
  it('10分間、同じ入力の全Snapshotハッシュが一致し異なるseedとは異なる', () => {
    const hash = hashRun(1)
    expect(hashRun(1)).toBe(hash)
    expect(hashRun(2)).not.toBe(hash)
  })
  it('seed 0も復元でき、乱数の状態はuint32の数値1つ', () => {
    const state = { rng: 0 }; const restore = { ...state }
    expect(random(state)).toBe(random(restore))
    expect(state.rng).toBeGreaterThanOrEqual(0)
    expect(state.rng).toBeLessThan(b.rng.divisor)
  })
  it('Snapshotの配列を書き換えてもWorldを変更しない', () => {
    expect(() => createWorld({ level: 61 })).toThrow('Lv must be')
    const world = createWorld(); const copy = snapshot(world, 42)
    copy.units[0].effects.push('fake'); copy.units[0].x = 999
    expect(world.units[0].effects).toEqual([]); expect(world.units[0].x).toBe(0)
    expect(copy.koban).toBe(42)
  })
  it('通常攻撃が出撃3ジョブから出てダメージ・報酬になる', () => {
    const world = battle(), jobs = new Set<string>()
    // Hold durable enemies in melee range to exercise every job independently of balance.
    for (const enemy of world.units.filter((unit) => unit.side === 'enemy')) {
      enemy.x = 14; enemy.hp = 1000; enemy.stats.maxHp = 1000; enemy.base.maxHp = 1000
    }
    let damage = 0, rewards = 0
    for (let count = 0; count < 6000; count++) for (const event of step(world)) {
      if (event.t === 'damage') {
        damage += event.amount
        const owner = world.units.find((unit) => unit.uid === event.sourceUid)
        if (owner?.side === 'ally') jobs.add(owner.defId)
      }
      if (event.t === 'reward') rewards++
    }
    expect([...jobs].sort()).toEqual(['ninja', 'otaku', 'samurai'])
    expect(damage).toBeGreaterThan(0); expect(rewards).toBeGreaterThan(0)
  })
  it('忍者は射程内でHPが最小の敵、近接は射程外を狙わない', () => {
    const world = battle(), ninja = world.units.find((unit) => unit.defId === 'ninja')!
    const opponents = world.units.filter((unit) => unit.side === 'enemy')
    opponents[0].hp = 2; opponents[1].hp = 1
    expect(chooseTarget(world, ninja)?.uid).toBe(opponents[1].uid)
    expect(chooseTarget(world, world.units[0])).toBeUndefined()
  })
  it('弾の対象が先に死亡したら生きている同じ側の敵へ着弾する', () => {
    const world = battle(), owner = world.units[1], targets = world.units.filter((unit) => unit.side === 'enemy')
    targets[0].alive = false; targets[0].hp = 0
    const hp = targets[1].hp
    world.projectiles = [{ id: world.nextId++, ownerUid: owner.uid, targetUid: targets[0].uid, launchTick: world.tick - 1, hitTick: world.tick, kind: 'shuriken', payload: { mul: 1, forceCrit: true } }]
    targets[1].stats.eva = 0
    step(world)
    expect(targets[1].hp).toBeLessThan(hp)
  })
})
describe('フェーズ遷移と回復', () => {
  it('歩行4秒分だけ回復し、出現への遷移時に余分に回復しない', () => {
    const world = createWorld(), ally = world.units[0]
    ally.hp = 1
    advanceTo(world, 'spawning')
    expect(ally.hp).toBeCloseTo(1 + ally.stats.maxHp * b.walkHealPerSecond * b.walkMs / 1000)
  })
  it('waveClear→次のwalking、倒れた味方は30%で復帰', () => {
    const world = battle()
    world.units[1].alive = false; world.units[1].hp = 0
    for (const unit of world.units.filter((unit) => unit.side === 'enemy')) unit.hp = 0
    step(world); expect(world.phase).toBe('waveClear')
    expect(world.units[1].alive).toBe(true)
    expect(world.units[1].hp).toBeCloseTo(world.units[1].stats.maxHp * 0.3)
    advanceTo(world, 'walking'); expect(world.wave).toBe(2)
    expect(world.units).toHaveLength(3)
  })
  it('10wave目の後はstageClear、周回は同じステージのwave1', () => {
    const world = battle(); world.wave = 10; world.loop = true
    for (const unit of world.units.filter((unit) => unit.side === 'enemy')) unit.hp = 0
    step(world); advanceTo(world, 'stageClear'); advanceTo(world, 'walking')
    expect(world.stageNo).toBe(1); expect(world.wave).toBe(1)
  })
  it('周回OFFでは次ステージへ進む', () => {
    const world = battle(); world.wave = 10
    for (const unit of world.units.filter((unit) => unit.side === 'enemy')) unit.hp = 0
    step(world); advanceTo(world, 'stageClear'); advanceTo(world, 'walking')
    expect(world.stageNo).toBe(2)
  })
  it('全滅→3秒待ち→同じステージのwave1で全員復帰', () => {
    const world = battle(); world.wave = 7
    for (const unit of world.units.filter((unit) => unit.side === 'ally')) unit.hp = 0
    const tick = world.tick; step(world); expect(world.phase).toBe('wipe')
    advanceTo(world, 'walking')
    expect(world.tick - tick).toBe(b.wipeMs / b.tickMs + 1)
    expect(world.wave).toBe(1); expect(world.wipeStreak).toBe(1)
    expect(world.units.every((unit) => unit.alive && unit.hp === unit.stats.maxHp)).toBe(true)
  })
  it('wave10の前はbossIntro、護衛2体のあとにボスが200msおきに出る', () => {
    const world = createWorld({ stageNo: 20 }); world.wave = 10
    advanceTo(world, 'bossIntro'); const intro = world.tick - 1
    advanceTo(world, 'spawning'); expect(world.tick - 1 - intro).toBe(b.bossIntroMs / b.tickMs)
    expect(world.units.filter((unit) => unit.side === 'enemy')).toHaveLength(1)
    const first = world.tick - 1; advanceTo(world, 'battle')
    expect(world.tick - 1 - first).toBe(2 * b.spawnMs / b.tickMs)
    expect(world.units.filter((unit) => unit.side === 'enemy').map((unit) => unit.defId).at(-1)).toBe('ooni')
  })
})
