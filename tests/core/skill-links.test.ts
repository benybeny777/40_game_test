import { describe, expect, it } from 'vitest'
import { createWorld } from '../../src/core/sim/world.ts'
import { enemies } from '../../src/core/data/enemies.ts'
import { skills, ultimates } from '../../src/core/sim/skills.ts'
import { strike } from '../../src/core/sim/actions.ts'
import type { Effect, JobId, SimEvent, Unit } from '../../src/core/sim/types.ts'

function fight(job: JobId) {
  const world = createWorld({ level: 15, seed: 4 })
  const self = [...world.units, ...world.reserves].find((u) => u.defId === job)!
  self.stats.cri = 0
  const foes: Unit[] = [0, 1, 2].map((index) => ({ ...self, uid: 100 + index, defId: 'ooni', side: 'enemy', x: 14 + index * 10,
    base: { ...enemies.ooni.base }, stats: { ...enemies.ooni.base }, hp: 10000, effects: [], gauges: {}, action: { kind: 'none', untilTick: 0 } }))
  world.units = [self, ...foes]
  const events: SimEvent[] = []
  return { world, self, foes, events }
}
const effect = (kind: Effect['kind'], tag: string, value: number, untilTick = 100): Effect => ({ kind, tag, value, untilTick, sourceUid: 99 })

describe('existing status links give compositions distinct jobs', () => {
  it('maid prioritizes the marked enemy and guarantees only the opening critical', () => {
    const ctx = fight('maid')
    ctx.foes[2].effects.push(effect('dmgTakenPct', 'attention', 0.2))
    skills.knifevolley.use(ctx)
    const hits = ctx.events.filter((e) => e.t === 'damage')
    expect(hits.map((e) => e.uid)).toEqual([102, 102, 102])
    expect(hits.map((e) => e.crit)).toEqual([true, false, false])
    expect(hits[0].tags).toContain('markedOpening')
    expect(ctx.foes[2].effects).toHaveLength(1) // Do not steal the party's mark.
  })
  it('expired marks do not redirect attacks or guarantee a critical', () => {
    const ctx = fight('maid')
    ctx.foes[2].effects.push(effect('dmgTakenPct', 'attention', 0.2, 0))
    skills.knifevolley.use(ctx)
    expect(ctx.events.filter((e) => e.t === 'damage').every((e) => e.uid === 100 && !e.crit)).toBe(true)
  })
  it('maid ultimate is six focused throws, samurai ultimate hits only the leading two', () => {
    const maid = fight('maid')
    ultimates.knifecurtain(maid)
    expect(maid.events.filter((e) => e.t === 'damage').map((e) => e.uid)).toEqual(Array(6).fill(100))
    const samurai = fight('samurai')
    ultimates.issen(samurai)
    expect(samurai.events.filter((e) => e.t === 'damage').map((e) => e.uid)).toEqual([100, 101])
  })
  it('sukeban can pursue slowed enemies without stacking the low-HP bonus', () => {
    const hit = (slow: boolean, low: boolean) => {
      const ctx = fight('sukeban'), target = ctx.foes[0]
      if (slow) target.effects.push(effect('intervalPct', 'nanmon', 0.25))
      if (low) target.hp = target.stats.maxHp * 0.3
      strike(ctx.world, ctx.self, target, { mul: 1 }, ctx.events)
      return ctx.events.find((e) => e.t === 'damage')!
    }
    const base = hit(false, false), slowed = hit(true, false), low = hit(false, true), both = hit(true, true)
    expect(slowed.amount).toBeGreaterThan(base.amount)
    expect(both.amount).toBe(low.amount)
    expect(slowed.tags).toContain('slowFollowup')
  })
  it('bancho gains a stronger counter only during an active miko ward', () => {
    const hit = (tag: string, untilTick = 100) => {
      const ctx = fight('bancho')
      ctx.self.stats.eva = 0
      ctx.self.effects.push(effect('dmgTakenPct', tag, -0.2, untilTick))
      strike(ctx.world, ctx.foes[0], ctx.self, { mul: 1 }, ctx.events)
      return ctx.events.filter((e) => e.t === 'damage').find((e) => e.tags?.includes('counter'))!
    }
    expect(hit('kekkai').amount).toBeGreaterThan(hit('tankaGuard').amount)
    expect(hit('misogi').tags).toContain('wardCounter')
    expect(hit('kekkai', 0).amount).toBe(hit('tankaGuard').amount)
  })
})
