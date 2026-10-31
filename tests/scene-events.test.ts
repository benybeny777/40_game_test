import { describe, expect, it, vi } from 'vitest'
import type { Snapshot, SnapshotUnit } from '../src/core/index.ts'
import { GAME_SPEED } from '../src/core/data/timing'
import { gaitTiming } from '../src/renderer/strip/gait'
import { drawDungeonBackground } from '../src/renderer/strip/background'

// Exercise the real event consumer without decoding images or launching a renderer.
vi.mock('../src/renderer/strip/sprites/sheet', () => ({ sheets: { chochin: { width: 1, height: 1, anchor: [0, 0] }, projectiles: { width: 1, height: 1, anchor: [0, 0] } }, frameAt: vi.fn(() => ({ normal: { width: 1, height: 1 }, flash: { width: 1, height: 1, tone: 'flash' } })) }))
vi.mock('../src/renderer/strip/background', () => ({ drawDungeonBackground: vi.fn() }))
import { Scene } from '../src/renderer/strip/scene'

const nextWave = (): Snapshot => ({ tick: 200, phase: 'walking', stageNo: 11, depthRank: 0, wave: 1, koban: 0, loop: false, units: [], projectiles: [], mines: [] })

describe('batched scene events', () => {
  it('places a last-hit drop at its former camera position when the same frame resets the wave', () => {
    const label = vi.fn(), scene = new Scene({ banner: vi.fn(), label })
    scene.W = 180; scene.H = 112
    const ally = { uid: 1, defId: 'chochin', side: 'ally', slot: 0, x: 1000, alive: true } as SnapshotUnit
    scene.ingest({ snapshot: { ...nextWave(), tick: 199, phase: 'battle', wave: 10, units: [ally] }, events: [] }, 1000)
    scene.ingest({ snapshot: nextWave(), events: [{ t: 'drop', x: 1010, rarity: 2, name: 'test' }] }, 1050)
    expect(label).toHaveBeenCalledOnce()
    const x = label.mock.calls[0][1] as number
    expect(x).toBeGreaterThan(scene.baseX)
    expect(x).toBeLessThan(scene.W)
  })
  it('draws an enemy defeat even when the death arrives with the next wave snapshot, and clears it on resume', () => {
    const scene = new Scene({ banner: vi.fn(), label: vi.fn() })
    scene.W = 180; scene.H = 112
    const enemy = { uid: 45, defId: 'chochin', side: 'enemy', x: 10, alive: true } as SnapshotUnit
    scene.ingest({ snapshot: { ...nextWave(), tick: 199, units: [enemy] }, events: [] }, 1000)
    scene.ingest({ snapshot: nextWave(), events: [{ t: 'death', uid: 45 }] }, 1050)
    const ctx = { clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), translate: vi.fn(), rotate: vi.fn() } as unknown as CanvasRenderingContext2D
    scene.draw(ctx, 1060)
    expect(vi.mocked(ctx.drawImage).mock.calls.some(call => (call[0] as unknown as { tone?: string }).tone === 'flash')).toBe(true)
    scene.draw(ctx, 1150)
    expect(ctx.rotate).toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalled()
    vi.mocked(ctx.rotate).mockClear()
    scene.draw(ctx, 1411)
    expect(ctx.rotate).not.toHaveBeenCalled()
    scene.resume(nextWave(), 1500); scene.draw(ctx, 1500)
    expect(ctx.rotate).not.toHaveBeenCalled()
  })
  it('uses the simulation speed for walking and loot lifetime, and resets the drawing clock on resume', () => {
    const scene = new Scene({ banner: vi.fn(), label: vi.fn() })
    scene.W = 384; scene.H = 112
    const ctx = { clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn() } as unknown as CanvasRenderingContext2D
    scene.ingest({ snapshot: nextWave(), events: [{ t: 'drop', x: 10, name: 'legendary', rarity: 4 }] }, 1000)
    scene.draw(ctx, 1000); scene.draw(ctx, 1050)
    expect(vi.mocked(drawDungeonBackground).mock.lastCall?.[1].walkOffset).toBeCloseTo(50 * GAME_SPEED * gaitTiming.dotsPerSecond / 1000)
    scene.draw(ctx, 1000 + 2201 / GAME_SPEED)
    expect(scene.busy(1000 + 2201 / GAME_SPEED)).toBe(false)
    scene.resume(nextWave(), 5000); scene.draw(ctx, 5050)
    expect(vi.mocked(drawDungeonBackground).mock.lastCall?.[1].walkOffset).toBeCloseTo(50 * GAME_SPEED * gaitTiming.dotsPerSecond / 1000)
  })
  it('accepts tell and interruption after the boss has legitimately left the current snapshot', () => {
    const banner = vi.fn(), label = vi.fn(), scene = new Scene({ banner, label })
    expect(() => scene.ingest({ snapshot: nextWave(), events: [
      { t: 'bossTell', uid: 45, skillId: 'kanabo', targetUids: [1, 2], resolveTick: 190 },
      { t: 'bossInterrupt', uid: 45, skillId: 'kanabo' },
      { t: 'death', uid: 45 },
    ] }, 1000)).not.toThrow()
    // The interruption must replace the warning immediately, ahead of queued loot.
    expect(banner.mock.calls).toEqual([['金棒振り 準備中', 'boss'], ['金棒振り 中断！', 'boss']])
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
    expect(label).toHaveBeenCalledWith('満杯で売却：神話の試験装備（小判 +500）', expect.any(Number), expect.any(Number), expect.any(String), 'info')
    expect(scene.busy(2100)).toBe(false)
  })
  it('separates sale of an old bag item from acquisition of the new legendary', () => {
    const banner = vi.fn(), label = vi.fn(), scene = new Scene({ banner, label })
    scene.ingest({ snapshot: nextWave(), events: [{ t: 'drop', x: 10, rarity: 4, name: '伝説の試験装備', sold: false,
      sale: { reason: 'capacity', name: '古い刀', rarity: 0, koban: 10 } }] }, 1000)
    expect(banner).toHaveBeenCalledWith('伝説の装備！ 伝説の試験装備', 'loot')
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
