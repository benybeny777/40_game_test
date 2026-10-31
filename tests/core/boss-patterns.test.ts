import { describe, expect, it } from 'vitest'
import { bossPattern, bossSkillById, bossSkillOwner, BOSS_VARIATION_DEPTH, MIXED_CAT_ATTACK_MUL } from '../../src/core/data/bossPatterns.ts'
import { enemies } from '../../src/core/data/enemies.ts'
import { createWorld, step } from '../../src/core/sim/world.ts'
import { canStartBossSkill } from '../../src/core/sim/boss.ts'
import type { SimEvent, Unit } from '../../src/core/sim/types.ts'
import { bossCue } from '../../src/renderer/strip/feedbackPresentation.ts'
import { DefeatTracker, validateDefeatRecord } from '../../src/core/progress/defeat.ts'
import { newProfile } from '../../src/core/progress/profile.ts'
import { balance } from '../../src/core/data/balance.ts'

function encounter(id: string, floor: number) {
  const world = createWorld({ seed: 12, stageNo: floor, level: 1 }), allies = [...world.units], def = enemies[id]
  world.phase = 'battle'
  const boss: Unit = { ...structuredClone(allies[0]), uid: 100, side: 'enemy', defId: id, x: 14, hp: def.base.maxHp,
    base: { ...def.base }, stats: { ...def.base }, effects: [], gauges: {}, action: { kind: 'none', untilTick: 0 } }
  world.units.push(boss)
  for (const ally of allies) {
    ally.hp = ally.base.maxHp = 100000; ally.base.eva = 0
    ally.attackReadyTick = ally.skillReadyTick = Number.MAX_SAFE_INTEGER
  }
  boss.attackReadyTick = Number.MAX_SAFE_INTEGER; boss.skillReadyTick = 0
  return { world, boss, allies }
}
function cast(encounter: ReturnType<typeof createWorld>, id: string) {
  const events: SimEvent[] = []
  for (let i = 0; i < 50 && !events.some(event => event.t === 'skill' && event.skillId === id); i++) events.push(...step(encounter))
  expect(events.some(event => event.t === 'skill' && event.skillId === id)).toBe(true)
  return events
}
describe('bounded late boss patterns', () => {
  it('cycles existing skills through later chapters and difficulty phases without adding unbounded skills', () => {
    for (const rank of [0, 1, 2] as const) {
      const patterns = [50, 80, 110, 140].map(floor => bossPattern('ooni', floor, rank)!)
      expect(patterns.map(pattern => pattern.late)).toEqual(rank === 1 ? [false, true, false, true] : [true, false, true, false])
      expect(new Set(patterns.map(pattern => pattern.skill.id)).size).toBe(2)
    }
  })
  it('preserves fox total skill damage and mixed summon base DPS including double strikes', () => {
    const original = enemies.denno_kyubi.boss!.skill, changed = bossPattern('denno_kyubi', 60, 0)!.skill
    if (original.kind === 'summon' || changed.kind === 'summon') throw new Error('Unexpected summon')
    expect(changed.targets * changed.mul).toBeCloseTo(original.targets * original.mul)
    const mimicDps = enemies.manekimodoki.base.atk * enemies.manekimodoki.attack.mul / enemies.manekimodoki.base.intervalMs
    const catDps = enemies.bakeneko.base.atk * enemies.bakeneko.attack.mul * balance.doubleHitMul * 2 * MIXED_CAT_ATTACK_MUL / enemies.bakeneko.base.intervalMs
    expect(MIXED_CAT_ATTACK_MUL).toBeCloseTo(1 / 3)
    expect(mimicDps + catDps).toBeCloseTo(2 * mimicDps)
  })
  it.each(['ooni', 'manekitaisho', 'denno_kyubi'])('changes %s at the hundred-floor halfway point without rewriting a pending cast', id => {
    const { world, boss } = encounter(id, 100)
    const first = bossPattern(id, 100, 0)!, second = bossPattern(id, 100, 0, true)!
    expect(first.milestone).toBe(true)
    expect(first.secondPhase?.skill.id).toBe(second.skill.id)
    expect(first.skill.id).toBe(enemies[id].boss!.skill.id)
    expect(step(world).some(event => event.t === 'bossTell' && event.skillId === first.skill.id)).toBe(true)
    boss.hp = boss.stats.maxHp / 2
    const oldCast = cast(world, first.skill.id)
    expect(oldCast.some(event => event.t === 'skill' && event.skillId === second.skill.id)).toBe(false)
    boss.skillReadyTick = 0
    const newCast = cast(world, second.skill.id)
    expect(newCast.some(event => event.t === 'bossTell' && event.skillId === second.skill.id)).toBe(true)
  })
  it.each(['ooni', 'manekitaisho', 'denno_kyubi'])('selects %s at the exact shared progression threshold without changing cooldown or cast time', id => {
    const early = bossPattern(id, BOSS_VARIATION_DEPTH - 1, 0)!, late = bossPattern(id, BOSS_VARIATION_DEPTH, 0)!
    expect(early.late).toBe(false); expect(late.late).toBe(true)
    expect(bossPattern(id, 20, 1)?.late).toBe(true)
    expect(late.skill.castMs).toBe(early.skill.castMs)
    expect(late.skill.cooldownMs).toBe(early.skill.cooldownMs)
    expect(bossSkillById(id, late.skill.id)).toEqual(late.skill)
    expect(bossSkillOwner(late.skill.id)?.enemy.id).toBe(id)
    expect(bossCue(late.skill.id).skill.name).toBe(late.skill.name)
  })
  it('widens the ogre sweep to all three visible targets with lower per-target damage but comparable total threat', () => {
    for (const [floor, count, id] of [[10, 2, 'kanabo'], [70, 3, 'kanabo_sweep']] as const) {
      const { world, allies, boss } = encounter('ooni', floor)
      const events = cast(world, id)
      const tell = events.find(event => event.t === 'bossTell')!
      expect(tell.t === 'bossTell' && tell.targetUids).toEqual(allies.slice(0, count).map(unit => unit.uid))
      expect(events.filter((event): event is Extract<SimEvent, { t: 'damage' }> => event.t === 'damage' && event.sourceUid === boss.uid).map(event => event.uid)).toEqual(allies.slice(0, count).map(unit => unit.uid))
    }
    const initial = bossPattern('ooni', 10, 0)!.skill, later = bossPattern('ooni', 70, 0)!.skill
    if (initial.kind === 'summon' || later.kind === 'summon') throw new Error('Unexpected test skill')
    expect(later.mul * later.targets).toBeCloseTo(initial.mul * initial.targets * 1.05)
  })
  it('locks the fox fire on the rear two and resolves only those targets', () => {
    const { world, boss, allies } = encounter('denno_kyubi', 60)
    const events = cast(world, 'kitsunebi_rear'), targets = allies.slice(1).map(unit => unit.uid)
    const tell = events.find(event => event.t === 'bossTell')!
    expect(tell.t === 'bossTell' && [...tell.targetUids].sort()).toEqual([...targets].sort())
    expect(events.filter((event): event is Extract<SimEvent, { t: 'damage' }> => event.t === 'damage' && event.sourceUid === boss.uid).map(event => event.uid).sort()).toEqual([...targets].sort())
    expect(allies[0].hp).toBe(100000)
  })
  it('summons the mixed pair with a shared cap and reduced cat attack, without indefinite growth', () => {
    const { world, boss } = encounter('manekitaisho', 50)
    cast(world, 'shoufuku_mixed')
    const adds = () => world.units.filter(unit => unit.side === 'enemy' && unit.uid !== boss.uid && unit.alive)
    expect(adds().map(unit => unit.defId)).toEqual(['manekimodoki', 'bakeneko'])
    const scaled = adds().find(unit => unit.defId === 'bakeneko')!
    const plain = adds().find(unit => unit.defId === 'manekimodoki')!
    expect(scaled.base.atk / plain.base.atk).toBeCloseTo(enemies.bakeneko.base.atk * MIXED_CAT_ATTACK_MUL / enemies.manekimodoki.base.atk)
    boss.skillReadyTick = 0; cast(world, 'shoufuku_mixed')
    expect(adds()).toHaveLength(4)
    boss.skillReadyTick = 0
    expect(canStartBossSkill(world, boss)).toBe(false)
    const events = Array.from({ length: 100 }, () => step(world)).flat()
    expect(events.some(event => event.t === 'bossTell' && event.uid === boss.uid)).toBe(false)
    expect(adds()).toHaveLength(4)
  })
  it('records and validates a late fatal skill while rejecting that skill for a different enemy', () => {
    const { world, boss, allies } = encounter('denno_kyubi', 60), profile = newProfile('2026-11-01T00:00:00Z')
    const tracker = new DefeatTracker()
    tracker.observe(profile, world, [{ t: 'damage', uid: allies[2].uid, sourceUid: boss.uid, amount: 5, crit: false, tags: ['kitsunebi_rear'] },
      { t: 'death', uid: allies[2].uid }, { t: 'phase', phase: 'wipe', stageNo: 60, depthRank: 0, wave: 10 }])
    expect(validateDefeatRecord(profile.lastDefeat)?.party[2].fatalSource?.skillId).toBe('kitsunebi_rear')
    profile.lastDefeat!.party[2].fatalSource!.enemyId = 'ooni'
    expect(() => validateDefeatRecord(profile.lastDefeat)).toThrow('fatalSource.skillId')
  })
  it.each(['ooni', 'manekitaisho', 'denno_kyubi'])('keeps displacement counterplay for late %s', id => {
    const { world, boss } = encounter(id, 70), skill = bossPattern(id, 70, 0)!.skill
    const events = step(world)
    expect(events.some(event => event.t === 'bossTell' && event.skillId === skill.id)).toBe(true)
    boss.x += 24
    for (let index = 0; index < 30 && !events.some(event => event.t === 'bossInterrupt'); index++) events.push(...step(world))
    expect(events.some(event => event.t === 'bossInterrupt' && event.skillId === skill.id)).toBe(true)
    expect(events.some(event => event.t === 'skill' && event.skillId === skill.id)).toBe(false)
    expect(events.some(event => event.t === 'damage' && event.sourceUid === boss.uid)).toBe(false)
    expect(events.some(event => event.t === 'spawn')).toBe(false)
  })
})
