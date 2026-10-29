import { describe, expect, it } from 'vitest'
import { partyOrder } from '../src/core/data/jobs.ts'
import { gaitTiming, walkPose } from '../src/renderer/strip/gait'

describe('material-backed walking cadence', () => {
  it('advances all five real poses once per forty-dot stride at 6.25fps', () => {
    expect(gaitTiming.fps).toBe(gaitTiming.frames * gaitTiming.dotsPerSecond / gaitTiming.strideDots)
    for (const job of partyOrder) {
      const frames = new Set(Array.from({ length: 40 }, (_, distance) => walkPose(job, 0, distance).frame))
      expect([...frames].sort()).toEqual([0, 1, 2, 3, 4])
      const first = walkPose(job, 0, 13), next = walkPose(job, 0, 13 + gaitTiming.strideDots)
      expect(next.frame).toBe(first.frame); expect(next.phase).toBeCloseTo(first.phase)
    }
  })
  it('freezes when ground distance freezes and offsets characters instead of marching in lockstep', () => {
    expect(walkPose('samurai', 0, 24)).toEqual(walkPose('samurai', 0, 24))
    expect(walkPose('samurai', 0, 24).phase).not.toBe(walkPose('samurai', 1, 24).phase)
    expect(walkPose('samurai', 0, 24).phase).not.toBe(walkPose('ninja', 0, 24).phase)
  })
  it('keeps ground-aligned heavy/timid motion distinct from hopping without scaling the body', () => {
    const hops = Array.from({ length: 40 }, (_, distance) => walkPose('jiangshi', 1, distance))
    expect(Math.min(...hops.map(pose => pose.dy))).toBe(-5)
    expect(Math.max(...hops.map(pose => pose.dy))).toBe(0)
    for (const job of partyOrder) for (let distance = 0; distance < 40; distance++) {
      const pose = walkPose(job, 2, distance)
      expect(Number.isInteger(pose.dx) && Number.isInteger(pose.dy)).toBe(true)
      expect(pose.frame).toBeGreaterThanOrEqual(0); expect(pose.frame).toBeLessThan(5)
      if (job === 'rikishi' || job === 'farmer') expect(pose.dy).toBe(0)
    }
  })
})
