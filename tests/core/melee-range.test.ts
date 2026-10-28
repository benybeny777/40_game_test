import { describe, expect, it } from 'vitest'
import { createWorld, partyOrder, step, type JobId, type SimEvent } from '../../src/core/index.ts'
import { chooseTarget, normalAttackInRange } from '../../src/core/sim/combat.ts'

function fixture(active: JobId[] = ['samurai', 'bancho', 'rikishi']) {
  const world = createWorld({ order: [...active, ...partyOrder.filter(job => !active.includes(job))] })
  for (let tick = 0; world.phase !== 'battle' && tick < 2000; tick++) step(world)
  expect(world.phase).toBe('battle')
  const allies = world.units.filter(unit => unit.side === 'ally'), enemy = world.units.find(unit => unit.side === 'enemy')!
  world.units = [...allies, enemy]
  for (const unit of world.units) {
    unit.hp = unit.base.maxHp = unit.stats.maxHp = 100000
    unit.effects = []; unit.action = { kind: 'none', untilTick: 0 }; unit.ult = 0
    unit.attackReadyTick = unit.side === 'ally' ? world.tick : world.tick + 10000
    unit.skillReadyTick = world.tick + 10000
  }
  enemy.x = 14; enemy.base.eva = enemy.stats.eva = 0
  return { world, allies, enemy }
}

describe('通常近接の踏み込み射程', () => {
  it('3近接全員が通常攻撃とダメージを出し、home/slot/aggroを変えない', () => {
    const { world, allies } = fixture(), before = allies.map(unit => ({ x: unit.x, slot: unit.slot, aggro: unit.aggro }))
    const events: SimEvent[] = []
    for (let tick = 0; tick < 20; tick++) events.push(...step(world))
    for (const unit of allies) {
      expect(events.some(event => event.t === 'attack' && event.uid === unit.uid)).toBe(true)
      expect(events.some(event => event.t === 'damage' && event.sourceUid === unit.uid && !event.tags)).toBe(true)
    }
    expect(allies.map(unit => ({ x: unit.x, slot: unit.slot, aggro: unit.aggro }))).toEqual(before)
  })
  it('先頭が戦闘不能なら次の生存前衛homeを原点とし、古い前衛の位置を使わない', () => {
    const { world, allies, enemy } = fixture()
    allies[0].alive = false; allies[0].hp = 0
    expect(normalAttackInRange(world, allies[2], enemy)).toBe(false) // x14 is 32 dots from the new front at -18.
    enemy.x = allies[1].x + 14
    expect(chooseTarget(world, allies[2])?.uid).toBe(enemy.uid)
    expect(normalAttackInRange(world, allies[2], enemy)).toBe(true)
    enemy.x = allies[1].x + allies[2].stats.rangeDots + 1
    expect(chooseTarget(world, allies[2])).toBeUndefined()
  })
  it('前衛死亡がwindup中に起きても、攻撃確定時に新しい原点で射程を再確認する', () => {
    const { world, allies } = fixture()
    step(world)
    expect(allies[2].action.kind).toBe('windup')
    allies[0].alive = false; allies[0].hp = 0
    const events = Array.from({ length: 4 }, () => step(world)).flat()
    expect(events.some(event => event.t === 'damage' && event.sourceUid === allies[2].uid)).toBe(false)
  })
  it('windup後に敵が遠くへ移動したら、後列近接の攻撃も命中させない', () => {
    const { world, allies, enemy } = fixture()
    step(world)
    expect(allies[1].action.kind).toBe('windup')
    enemy.x = 200
    const events = Array.from({ length: 4 }, () => step(world)).flat()
    expect(events.some(event => event.t === 'damage' && allies.some(unit => unit.uid === event.sourceUid))).toBe(false)
  })
  it('味方遠距離は自分のhomeから射程を判定し、前衛基準へ広げない', () => {
    const { world, allies, enemy } = fixture(['samurai', 'ninja', 'otaku'])
    enemy.x = allies[1].x + allies[1].stats.rangeDots
    expect(chooseTarget(world, allies[1])?.uid).toBe(enemy.uid)
    enemy.x++
    expect(normalAttackInRange(world, allies[1], enemy)).toBe(false)
    expect(chooseTarget(world, allies[1])).toBeUndefined()
  })
  it('敵の近接と遠距離は従来どおり各自の位置から判定する', () => {
    const { world, allies, enemy } = fixture()
    expect(normalAttackInRange(world, enemy, allies[0])).toBe(true)
    expect(normalAttackInRange(world, enemy, allies[1])).toBe(false)
    expect(chooseTarget(world, enemy)?.uid).toBe(allies[0].uid)
    enemy.defId = 'onibi'; enemy.stats.rangeDots = 110; enemy.x = 100
    expect(normalAttackInRange(world, enemy, allies[0])).toBe(true)
    expect(normalAttackInRange(world, enemy, allies[2])).toBe(false)
  })
  it('長い竹槍の固有射程は維持し、踏み込みで任意の距離を殴れるようにはしない', () => {
    const { world, allies, enemy } = fixture(['samurai', 'bancho', 'farmer'])
    enemy.x = allies[0].x + allies[2].stats.rangeDots
    expect(normalAttackInRange(world, allies[2], enemy)).toBe(true)
    expect(normalAttackInRange(world, allies[0], enemy)).toBe(false)
    enemy.x++
    expect(normalAttackInRange(world, allies[2], enemy)).toBe(false)
  })
})
