import { describe, expect, it } from 'vitest'
import { balance } from '../src/core/data/balance'
import { PARTY_SPACING_SCALE } from '../src/shared/art'
import type { Snapshot, SnapshotUnit } from '../src/core/sim/types'
import { BattleCamera, formationAdvance, panPoints } from '../src/renderer/strip/battleCamera'
import { DefeatEchoes } from '../src/renderer/strip/impactPresentation'

const snapshot = (advance: number, tick = 1, wave = 1, phase: Snapshot['phase'] = 'battle'): Snapshot => ({
  tick, wave, phase, stageNo: 1, depthRank: 0, koban: 0, loop: false, projectiles: [], mines: [],
  units: [0, 1, 2].map(slot => ({ uid: slot + 1, slot, side: 'ally', alive: slot !== 0, x: advance - slot * balance.formationGap }) as SnapshotUnit),
})
describe('formation-following battle camera', () => {
  it('tracks a fallen front or reordered ally by its home offset, independent of an arbitrarily distant push', () => {
    const state = snapshot(10000)
    expect(formationAdvance(state)).toBe(10000)
    state.units.reverse()
    expect(formationAdvance(state)).toBe(10000)
    const camera = new BattleCamera()
    expect(camera.ingest(state)).toBe(true)
    expect(camera.at(1)).toBe(10000)
  })
  it('interpolates camera and units together so the party and nearby targets remain in view', () => {
    const camera = new BattleCamera()
    camera.ingest(snapshot(1000)); camera.ingest(snapshot(1010, 2))
    for (const alpha of [0, 0.25, 0.5, 1]) {
      const allyX = 1000 + 10 * alpha
      expect((allyX - camera.at(alpha)) * PARTY_SPACING_SCALE).toBe(0)
      const targetX = 1025
      expect((targetX - camera.at(alpha)) * PARTY_SPACING_SCALE).toBeGreaterThan(0)
    }
  })
  it('resets at a new wave or resumed world without scrolling backwards over old battlefield coordinates', () => {
    const camera = new BattleCamera()
    camera.ingest(snapshot(500)); camera.ingest(snapshot(520, 2))
    expect(camera.ingest(snapshot(0, 3, 2, 'walking'))).toBe(true)
    expect(camera.at(0)).toBe(0); expect(camera.at(0.5)).toBe(0)
    camera.clear(); expect(camera.ingest(snapshot(300, 100))).toBe(true)
    expect(camera.at(0)).toBe(300)
  })
  it('moves world-anchored effects and retained deaths by exactly the camera displacement', () => {
    const points = [{ x: 90 }, { x: 120 }], echoes = new DefeatEchoes<string>()
    echoes.add(1, 0, 90, 100, 'enemy')
    panPoints(points, 15); echoes.pan(15)
    expect(points).toEqual([{ x: 75 }, { x: 105 }])
    expect(echoes.sample(0)[0].x).toBe(75)
  })
})
