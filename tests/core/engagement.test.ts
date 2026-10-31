import { describe, expect, it } from 'vitest'
import { balance as b } from '../../src/core/data/balance.ts'
import { enemies } from '../../src/core/data/enemies.ts'
import { partyOrder } from '../../src/core/data/jobs.ts'
import { createWorld, snapshot, step } from '../../src/core/sim/world.ts'
import type { JobId, SimEvent, Unit } from '../../src/core/sim/types.ts'

function battle(party: JobId[], enemyId = 'noroifig') {
  const world = createWorld({ seed: 9, order: [...party, ...partyOrder.filter(id => !party.includes(id))] })
  world.phase = 'battle'
  for (const ally of world.units) ally.skillReadyTick = Number.MAX_SAFE_INTEGER
  const def = enemies[enemyId]
  const enemy: Unit = { ...structuredClone(world.units[0]), uid: 999, side: 'enemy', defId: enemyId,
    slot: 0, x: 40, hp: 10000, base: { ...def.base, maxHp: 10000, eva: 0 }, stats: { ...def.base, maxHp: 10000, eva: 0 },
    action: { kind: 'none', untilTick: 0 }, attackReadyTick: Number.MAX_SAFE_INTEGER }
  world.units.push(enemy)
  return { world, enemy, allies: world.units.filter(unit => unit.side === 'ally') }
}

describe('physical engagement and interrupted attack targets', () => {
  it.each(['onibi', 'bugsei', 'noroifig'])('melee-only parties close on stationary ranged %s and land normal attacks', id => {
    const { world, enemy, allies } = battle(['bancho', 'rikishi', 'jiangshi'], id)
    const events: SimEvent[] = []
    for (let tick = 0; tick < 30; tick++) {
      const oldX = allies[0].x
      events.push(...step(world))
      expect(allies[0].x - oldX).toBeGreaterThanOrEqual(0)
      expect(allies[0].x - oldX).toBeLessThanOrEqual(b.allyAdvanceDotsPerSecond * b.tickMs / 1000)
      expect(allies[0].x - allies[1].x).toBe(b.formationGap)
      expect(allies[1].x - allies[2].x).toBe(b.formationGap)
    }
    expect(enemy.x).toBe(40)
    for (const ally of allies) expect(events.some(event => event.t === 'damage' && event.sourceUid === ally.uid)).toBe(true)
    expect(allies[0].x).toBeGreaterThan(0)
  })
  it('keeps rear spacing and reaches the shortest melee range after the front dies', () => {
    const { world, allies } = battle(['otaku', 'samurai', 'rikishi'])
    allies[0].hp = 0; allies[0].alive = false
    allies[1].base.rangeDots = 12; allies[2].base.rangeDots = 16
    const events: SimEvent[] = []
    for (let tick = 0; tick < 40; tick++) events.push(...step(world))
    expect(allies[1].x).toBe(28)
    expect(allies[1].x - allies[2].x).toBe(18)
    expect(allies[0].x - allies[1].x).toBe(18)
    expect(events.some(event => event.t === 'damage' && event.sourceUid === allies[1].uid)).toBe(true)
  })
  it('does not advance a ranged-only formation or freeze behind an enemy cast', () => {
    const ranged = battle(['otaku', 'ninja', 'pachipro'])
    step(ranged.world); expect(ranged.allies[0].x).toBe(0)
    const { world, enemy, allies } = battle(['samurai', 'ninja', 'otaku'])
    enemy.action = { kind: 'cast', untilTick: 999, skillId: 'unused', targetUids: [] }
    allies[1].action = { kind: 'cast', untilTick: 999, skillId: 'unused', targetUids: [] }
    step(world)
    expect(allies[0].x).toBe(6)
    expect(snapshot(world).units[0].action).toBe('move')
    allies[0].action = { kind: 'windup', untilTick: 999, targetUid: enemy.uid }
    step(world); expect(allies[0].x).toBe(6)
  })
  it('returns the entire formation home at the next wave boundary', () => {
    const { world, allies } = battle(['samurai', 'ninja', 'otaku'])
    step(world); expect(allies[0].x).toBeGreaterThan(0)
    world.phase = 'waveClear'; world.phaseUntilTick = world.tick
    step(world)
    expect(world.phase).toBe('walking')
    expect(allies.map(unit => unit.x)).toEqual([0, -18, -36])
  })
  it('holds the line for an approaching enemy but advances when that same enemy stops to cast', () => {
    const { world, enemy, allies } = battle(['samurai', 'ninja', 'otaku'], 'ooni')
    enemy.action = { kind: 'move', untilTick: 100 }
    step(world)
    expect(allies[0].x).toBe(0)
    expect(enemy.x).toBeLessThan(40)
    enemy.action = { kind: 'cast', untilTick: 999, skillId: 'kanabo', targetUids: [allies[0].uid], originX: enemy.x }
    step(world)
    expect(allies[0].x).toBe(6)
    expect(enemy.x).toBe(39)
  })
  it('does not wait forever for a zero-speed enemy marked as moving', () => {
    const { world, enemy, allies } = battle(['samurai', 'ninja', 'otaku'])
    enemy.action = { kind: 'move', untilTick: Number.MAX_SAFE_INTEGER }
    step(world)
    expect(allies[0].x).toBe(6)
    expect(enemy.x).toBe(40)
  })
  it.each([14, 100])('retargets a slain windup only when another target is in reach (x=%i)', x => {
    const { world, enemy, allies } = battle(['samurai', 'ninja', 'otaku'])
    const attacker = allies[0]
    for (const ally of allies) ally.attackReadyTick = Number.MAX_SAFE_INTEGER
    enemy.hp = 0; enemy.alive = false
    const next: Unit = { ...structuredClone(enemy), uid: 1000, x, hp: 10000, alive: true }
    world.units.push(next)
    attacker.action = { kind: 'windup', untilTick: world.tick, targetUid: enemy.uid }
    const events = step(world)
    expect(events.filter(event => event.t === 'damage' && event.sourceUid === attacker.uid)).toHaveLength(x === 14 ? 1 : 0)
    expect(attacker.x).toBe(0)
    expect(next.x).toBe(x)
  })
  it('retargets a ranged windup to one projectile without applying instant damage', () => {
    const { world, enemy, allies } = battle(['ninja', 'otaku', 'pachipro'])
    const attacker = allies[0]
    for (const ally of allies) ally.attackReadyTick = Number.MAX_SAFE_INTEGER
    enemy.hp = 0; enemy.alive = false
    const next: Unit = { ...structuredClone(enemy), uid: 1000, hp: 10000, alive: true }
    world.units.push(next)
    attacker.action = { kind: 'windup', untilTick: world.tick, targetUid: enemy.uid }
    const events = step(world)
    expect(events.filter(event => event.t === 'damage' && event.sourceUid === attacker.uid)).toHaveLength(0)
    expect(world.projectiles.filter(projectile => projectile.ownerUid === attacker.uid)).toHaveLength(1)
    expect(world.projectiles[0].targetUid).toBe(next.uid)
    const hits: SimEvent[] = []
    for (let tick = 0; tick < 5; tick++) hits.push(...step(world))
    expect(hits.filter(event => event.t === 'damage' && event.sourceUid === attacker.uid)).toHaveLength(1)
  })
})
