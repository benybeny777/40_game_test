import { describe, expect, it } from 'vitest'
import { GAME_SPEED } from '../src/core/data/timing'
import { criticalRays, defeatPose, DefeatEchoes, impactPresentation, syncMeleeImpact } from '../src/renderer/strip/impactPresentation'

describe('bounded combat impact presentation', () => {
  it('holds the fatal hit in a local flash for 45 real milliseconds before the throw begins', () => {
    for (const age of [0, 44 * GAME_SPEED]) expect(defeatPose(age)).toMatchObject({ dx: 0, tilt: 0, alpha: 1, flash: true })
    expect(defeatPose(45 * GAME_SPEED).flash).toBe(false)
    expect(defeatPose(70 * GAME_SPEED).dx).toBeGreaterThan(0)
  })
  it('redirects only the current normal melee lunge to the authoritative damage target', () => {
    const visual = () => ({ anim: 'attack', animAt: 100, normalMelee: true, ranged: false, windupMs: 100, targetUid: 2, dashTargetX: 80 })
    const strike = visual()
    expect(syncMeleeImpact(strike, 3, 110, ['iai', 'slowFollowup'], 200)).toBe(true)
    expect(strike).toMatchObject({ targetUid: 3, dashTargetX: 110, animAt: 100 })
    for (const tags of [['counter'], ['counter', 'wardCounter'], ['harite'], ['issen'], ['knifevolley']]) {
      const other = visual()
      expect(syncMeleeImpact(other, 3, 110, tags, 200)).toBe(false)
      expect(other.targetUid).toBe(2)
    }
    expect(syncMeleeImpact({ ...visual(), ranged: true }, 3, 110, undefined, 200)).toBe(false)
    expect(syncMeleeImpact({ ...visual(), normalMelee: false }, 3, 110, undefined, 200)).toBe(false)
    expect(syncMeleeImpact(visual(), 3, 110, undefined, 1000)).toBe(false)
  })
  it('keeps an identifiable sprite before fading, with a short upward and outward arc', () => {
    expect(defeatPose(0)).toMatchObject({ dx: 0, alpha: 1 })
    expect(defeatPose(0).dy).toBeCloseTo(0)
    const middle = defeatPose(180 * GAME_SPEED)
    expect(middle.dx).toBeGreaterThan(0); expect(middle.dy).toBeLessThan(0)
    expect(middle.alpha).toBeGreaterThan(0.5)
    expect(defeatPose(impactPresentation.defeatMs).alpha).toBe(0)
  })
  it('retains deaths independently of snapshots, deduplicates and caps them, then clears on resume', () => {
    const echoes = new DefeatEchoes<string>()
    echoes.add(1, 100, 30, 100, 'enemy')
    echoes.add(1, 110, 30, 100, 'duplicate')
    expect(echoes.sample(110)).toHaveLength(1)
    expect(echoes.sample(110)[0].payload).toBe('enemy')
    for (let uid = 2; uid <= 20; uid++) echoes.add(uid, 110, uid, 100, 'enemy')
    expect(echoes.sample(110)).toHaveLength(impactPresentation.maxDefeats)
    expect(echoes.sample(110 + impactPresentation.defeatMs)).toEqual([])
    expect(echoes.active).toBe(false)
    echoes.add(21, 1000, 20, 100, 'enemy'); echoes.clear()
    expect(echoes.sample(1000)).toEqual([])
  })
  it('keeps critical rays within a small target-sized area and removes them after 180 real milliseconds', () => {
    const rays = criticalRays(90 * GAME_SPEED)
    expect(rays).toHaveLength(6)
    for (const ray of rays) for (const value of [ray.x1, ray.y1, ray.x2, ray.y2]) expect(Math.abs(value)).toBeLessThanOrEqual(12)
    expect(criticalRays(-1)).toEqual([])
    expect(criticalRays(180 * GAME_SPEED)).toEqual([])
  })
})
