import { describe, expect, it } from 'vitest'
import { createWorld, snapshot, step } from '../../src/core/sim/world.ts'
import { enemies } from '../../src/core/data/enemies.ts'
import { balance } from '../../src/core/data/balance.ts'
import type { SimEvent, Unit } from '../../src/core/sim/types.ts'
import { bossTrial, formations } from '../../tools/boss-balance.ts'
import { partyOrder } from '../../src/core/data/jobs.ts'
import { skills } from '../../src/core/sim/skills.ts'
import { canReserveBossSkill } from '../../src/core/sim/boss.ts'

function encounter(id: string) {
  const world = createWorld({ seed: 12, level: 1 })
  world.phase = 'battle'
  const template = world.units[0]
  const def = enemies[id]
  const boss: Unit = { ...template, uid: 100, side: 'enemy', defId: id, x: 14,
    base: { ...def.base }, stats: { ...def.base }, hp: def.base.maxHp,
    effects: [], gauges: {}, action: { kind: 'none' as const, untilTick: 0 } }
  world.units.push(boss)
  for (const unit of world.units) {
    unit.attackReadyTick = Number.MAX_SAFE_INTEGER
    unit.skillReadyTick = unit === boss ? 0 : Number.MAX_SAFE_INTEGER
  }
  return { world, boss }
}

describe('boss telegraphs and composition choices', () => {
  it('reserves interrupts only for target-eligible bosses whose action and cooldown finish within the window', () => {
    const { world, boss } = encounter('ooni')
    boss.action = { kind: 'windup', untilTick: world.tick + 5, targetUid: world.units[0].uid }
    boss.skillReadyTick = world.tick + 8
    expect(canReserveBossSkill(world, boss, 10)).toBe(true)
    boss.action.untilTick = world.tick + 11
    expect(canReserveBossSkill(world, boss, 10)).toBe(false)
    boss.action = { kind: 'move', untilTick: Number.MAX_SAFE_INTEGER }
    expect(canReserveBossSkill(world, boss, 10)).toBe(false)
    boss.action.untilTick = world.tick + 2; boss.skillReadyTick = world.tick + 11
    expect(canReserveBossSkill(world, boss, 10)).toBe(false)
    boss.skillReadyTick = world.tick; boss.x = 200
    expect(canReserveBossSkill(world, boss, 10)).toBe(false)
  })
  it('張り手は近い護衛より射程内で詠唱中のボスを押す', () => {
    const { world, boss } = encounter('ooni')
    const rikishi = world.reserves.find((u) => u.defId === 'rikishi')!
    rikishi.x = 0
    world.units.unshift(rikishi)
    const escort = { ...boss, uid: 200, defId: 'kappa', x: 14, action: { kind: 'none' as const, untilTick: 0 } }
    boss.x = 34
    boss.action = { kind: 'cast', untilTick: 10, originX: 34, targetUids: [rikishi.uid], skillId: 'kanabo' }
    world.units.push(escort)
    const events: SimEvent[] = []
    skills.harite.use({ world, self: rikishi, events })
    expect(boss.x).toBe(58)
    expect(boss.action.interruptSource).toEqual({ uid: rikishi.uid, skillId: 'harite' })
    expect(escort.x).toBe(14)
    expect(events.some((e) => e.t === 'damage' && e.uid === boss.uid && e.tags?.includes('harite'))).toBe(true)
  })
  it('護衛付きの実ボスウェーブで張り手が自然に詠唱を中断する', () => {
    const party = formations.ward
    let interruptedWithEscorts = 0, interrupted = 0
    for (let seed = 1; seed <= 20; seed++) {
      let seedInterrupted = false, seedEscorts = false
      const world = createWorld({ seed, stageNo: 20, level: 15, order: [...party, ...partyOrder.filter((j) => !party.includes(j))] })
      world.wave = 10
      for (let tick = 0; tick < 1800; tick++) {
        const events = step(world)
        if (events.some((e) => e.t === 'bossInterrupt' && e.interruptSkillId === 'harite' && world.units.find((u) => u.uid === e.sourceUid)?.defId === 'rikishi')) {
          seedInterrupted = true
          if (world.units.some((u) => u.side === 'enemy' && u.alive && u.hp > 0 && !enemies[u.defId].boss)) seedEscorts = true
        }
        if (world.phase === 'wipe' || world.phase === 'waveClear') break
      }
      if (seedInterrupted) interrupted++
      if (seedEscorts) interruptedWithEscorts++
    }
    expect(interrupted).toBe(20)
    expect(interruptedWithEscorts).toBeGreaterThanOrEqual(15)
  })
  it.each(['summon-cap', 'out-of-range'])('ボスが発動不能なら張り手を温存しない: %s', (condition) => {
    const { world, boss } = encounter(condition === 'summon-cap' ? 'manekitaisho' : 'ooni')
    const rikishi = world.reserves.find((u) => u.defId === 'rikishi')!
    rikishi.x = 0; world.units.unshift(rikishi)
    boss.x = 48; boss.skillReadyTick = -1
    for (let i = 0; i < 4; i++) world.units.push({ ...boss, uid: 200 + i, defId: 'manekimodoki', x: 14 + i * 10, action: { kind: 'none', untilTick: 0 } })
    expect(skills.harite.canUse({ world, self: rikishi, events: [] })).toBe(true)
  })
  it.each(['ooni', 'manekitaisho', 'denno_kyubi'])('%s locks visible targets and resolves only after its charge', (id) => {
    const { world, boss } = encounter(id)
    const skill = enemies[id].boss!.skill
    const events: SimEvent[] = step(world)
    const tell = events.find((event) => event.t === 'bossTell')!
    expect(tell).toMatchObject({ uid: boss.uid, skillId: skill.id })
    expect(events.some((event) => event.t === 'skill')).toBe(false)
    const cast = snapshot(world).units.find((unit) => unit.uid === boss.uid)!.bossCast!
    expect(cast.skillId).toBe(skill.id)
    const x = boss.x
    while (world.tick < cast.resolveTick) {
      expect(step(world).some((event) => event.t === 'skill')).toBe(false)
      expect(boss.x).toBe(x)
    }
    const resolved = step(world)
    expect(resolved.some((event) => event.t === 'skill' && event.skillId === skill.id)).toBe(true)
    expect(snapshot(world).units.find((unit) => unit.uid === boss.uid)!.bossCast).toBeUndefined()
  })

  it.each(['ooni', 'manekitaisho', 'denno_kyubi'])('displacing %s interrupts the charge and spends its cooldown', (id) => {
    const { world, boss } = encounter(id)
    step(world)
    const ready = boss.skillReadyTick
    boss.x += 24 // Synthetic displacement checks the threshold; real harite attribution is tested above.
    const events: SimEvent[] = []
    while (world.tick <= Math.ceil(enemies[id].boss!.skill.castMs / balance.tickMs)) events.push(...step(world))
    expect(events.some((event) => event.t === 'bossInterrupt' && event.uid === boss.uid)).toBe(true)
    expect(events.some((event) => event.t === 'skill' && event.uid === boss.uid)).toBe(false)
    expect(boss.skillReadyTick).toBe(ready)
    expect(ready).toBeGreaterThan(world.tick)
  })

  it('killing the boss during charge prevents its skill', () => {
    const { world, boss } = encounter('ooni')
    step(world)
    boss.hp = 0
    const events = Array.from({ length: 15 }, () => step(world)).flat()
    expect(events.some((event) => event.t === 'skill' && event.uid === boss.uid)).toBe(false)
  })

  it('guard reduces a telegraphed strike instead of nullifying the warning', () => {
    const trial = (guard: boolean) => {
      const { world } = encounter('ooni')
      if (guard) for (const unit of world.units.filter((u) => u.side === 'ally')) unit.effects.push({ kind: 'dmgTakenPct', value: -0.25, untilTick: 100, sourceUid: unit.uid, tag: 'test-guard' })
      return Array.from({ length: 14 }, () => step(world)).flat().filter((e) => e.t === 'damage' && e.tags?.includes('kanabo')).reduce((sum, e) => sum + (e.t === 'damage' ? e.amount : 0), 0)
    }
    expect(trial(false)).toBeGreaterThan(0)
    expect(trial(true)).toBeLessThan(trial(false))
  })

  it('equal-power choices exchange speed for safety; stronger gear also wins without a healer', () => {
    const attack = bossTrial(formations.assault, 20, 1)
    const healer = bossTrial(formations.healer, 20, 1)
    expect(attack.result).toBe('waveClear')
    expect(healer.result).toBe('waveClear')
    expect(attack.seconds).toBeLessThan(healer.seconds)
    expect(healer.minHp).toBeGreaterThan(attack.minHp)
    expect(bossTrial(formations.assault, 30, 1, 15, 2).result).toBe('waveClear')
  })
})
