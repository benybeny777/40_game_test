import { describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../src/core/index.ts'

// Exercise the real event consumer without decoding images or launching a renderer.
vi.mock('../src/renderer/strip/sprites/sheet', () => ({ sheets: {}, frameAt: vi.fn() }))
vi.mock('../src/renderer/strip/background', () => ({ drawDungeonBackground: vi.fn() }))
import { Scene } from '../src/renderer/strip/scene'

const nextWave = (): Snapshot => ({ tick: 200, phase: 'walking', stageNo: 11, depthRank: 0, wave: 1, koban: 0, loop: false, units: [], projectiles: [], mines: [] })

describe('batched scene events', () => {
  it('accepts tell and interruption after the boss has legitimately left the current snapshot', () => {
    const banner = vi.fn(), label = vi.fn(), scene = new Scene({ banner, label })
    expect(() => scene.ingest({ snapshot: nextWave(), events: [
      { t: 'bossTell', uid: 45, skillId: 'kanabo', targetUids: [1, 2], resolveTick: 190 },
      { t: 'bossInterrupt', uid: 45, skillId: 'kanabo' },
      { t: 'death', uid: 45 },
    ] }, 1000)).not.toThrow()
    expect(banner.mock.calls).toEqual([['金棒振り 準備中', 'boss'], ['金棒振り 中断！', 'good']])
    expect(label).not.toHaveBeenCalled()
  })
  it.each(['bossTell', 'bossInterrupt'] as const)('rejects an unknown %s skill rather than hiding corrupted event data', t => {
    const scene = new Scene({ banner: vi.fn(), label: vi.fn() })
    expect(() => scene.ingest({ snapshot: nextWave(), events: [{ t, uid: 45, skillId: 'missing-skill', targetUids: [], resolveTick: 190 }] }, 1000)).toThrow('Unknown boss skill: missing-skill')
  })
  it('shows a sold mythic as a sale, without a rare acquisition banner or queued loot animation', () => {
    const banner = vi.fn(), label = vi.fn(), scene = new Scene({ banner, label })
    scene.ingest({ snapshot: nextWave(), events: [{ t: 'drop', x: 10, rarity: 5, name: '神話の試験装備', sold: true,
      sale: { reason: 'capacity', name: '神話の試験装備', rarity: 5, koban: 500 } }] }, 1000)
    expect(banner).not.toHaveBeenCalled()
    expect(label).toHaveBeenCalledWith('満杯で売却：神話の試験装備（小判 +500）', expect.any(Number), expect.any(Number), expect.any(String))
    expect(scene.busy(2100)).toBe(false)
  })
  it('separates sale of an old bag item from acquisition of the new legendary', () => {
    const banner = vi.fn(), label = vi.fn(), scene = new Scene({ banner, label })
    scene.ingest({ snapshot: nextWave(), events: [{ t: 'drop', x: 10, rarity: 4, name: '伝説の試験装備', sold: false,
      sale: { reason: 'capacity', name: '古い刀', rarity: 0, koban: 10 } }] }, 1000)
    expect(banner).toHaveBeenCalledWith('伝説の装備！ 伝説の試験装備', 'good')
    expect(label.mock.calls[0][0]).toBe('満杯で売却：古い刀（小判 +10）')
    expect(scene.busy(2100)).toBe(true)
  })
  it('resumes from a fresh snapshot with no previously queued loot effect', () => {
    const scene = new Scene({ banner: vi.fn(), label: vi.fn() })
    scene.ingest({ snapshot: nextWave(), events: [{ t: 'drop', x: 10, name: 'mythic', rarity: 5 }] }, 1000)
    expect(scene.busy(2100)).toBe(true)
    scene.resume({ ...nextWave(), tick: 300 }, 2200)
    expect(scene.cur!.tick).toBe(300)
    expect(scene.busy(3300)).toBe(false)
  })

})
