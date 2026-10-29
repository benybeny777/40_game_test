import { describe, expect, it } from 'vitest'
import { jobs, partyOrder } from '../src/core/index.ts'
import { sceneFixture, type PreviewMode } from '../src/renderer/qa-scene/fixture'

describe('deterministic scene QA fixtures', () => {
  it('uses real three-person snapshots for all 17 heroes in each biome and every mode', () => {
    for (const job of partyOrder) for (let biome = 0; biome < 3; biome++) for (const mode of ['attack', 'walking', 'skill', 'ultimate', 'loot', 'numbers', 'boss', 'interrupt'] as PreviewMode[]) {
      const cues = sceneFixture(job, biome, mode)
      expect(cues[0].snapshot.units.filter(unit => unit.side === 'ally')).toHaveLength(3)
      expect(cues[0].snapshot.units.find(unit => unit.side === 'ally')?.defId).toBe(job)
      expect(cues.every((cue, index) => index === 0 || cue.at >= cues[index - 1].at)).toBe(true)
      expect(cues[0].snapshot.stageNo).toBe(1 + biome * 5)
    }
  })
  it('keeps boss targets fixed until resolution, then removes the tell for both release and interruption', () => {
    for (let biome = 0; biome < 3; biome++) for (const mode of ['boss', 'interrupt'] as const) {
      const cues = sceneFixture('rikishi', biome, mode)
      expect(cues[0].events[0].t).toBe('bossTell')
      const first = cues[0].snapshot.units.find(unit => unit.bossCast)!
      for (const cue of cues.slice(0, -1)) expect(cue.snapshot.units.find(unit => unit.uid === first.uid)?.bossCast).toEqual(first.bossCast)
      expect(cues.at(-1)!.snapshot.units.every(unit => !unit.bossCast)).toBe(true)
      expect(cues.at(-1)!.events[0].t).toBe(mode === 'boss' ? 'skill' : 'bossInterrupt')
      if (mode === 'interrupt') expect(cues.at(-1)!.snapshot.units.find(unit => unit.uid === first.uid)!.x - first.x).toBe(20)
    }
  })
  it('does not show an extra projectile impact at release or award real inventory', () => {
    for (const job of partyOrder.filter(id => jobs[id].attack.kind === 'ranged')) {
      const cues = sceneFixture(job, 0, 'attack')
      const launch = cues.find(cue => cue.snapshot.projectiles.length)!
      expect(launch.events).toEqual([])
      expect(cues.at(-1)!.events[0].t).toBe('damage')
      expect(cues.at(-1)!.at).toBeGreaterThan(launch.at)
      expect(cues.filter(cue => cue.snapshot.projectiles.length)).toHaveLength(3)
    }
    expect(sceneFixture('samurai', 0, 'loot')[0].events.map(event => event.t)).toEqual(['drop', 'drop'])
    expect(sceneFixture('samurai', 0, 'walking')[0].snapshot.units.every(unit => unit.side === 'ally')).toBe(true)
  })
})
