import { describe, expect, it } from 'vitest'
import { lootPresentation, placeCombatLabel, SynergyFeedback, type LabelBox } from '../src/renderer/strip/feedbackPresentation'

describe('combat feedback readability', () => {
  it('labels only actual combo tags and coalesces multihits and rapid counters by source', () => {
    const feedback = new SynergyFeedback()
    expect(feedback.take(1, ['normal', 'counter'], 0)).toBeUndefined()
    expect(feedback.take(1, ['counter', 'wardCounter'], 0)?.text).toBe('結界反撃')
    expect(feedback.take(1, ['wardCounter'], 0)).toBeUndefined()
    expect(feedback.take(1, ['wardCounter'], 600)).toBeUndefined()
    expect(feedback.take(1, ['wardCounter'], 2399)).toBeUndefined()
    expect(feedback.take(1, ['wardCounter'], 2400)?.text).toBe('結界反撃')
    expect(feedback.take(2, ['slowFollowup'], 2400)?.text).toBe('鈍化追撃')
    expect(feedback.take(3, ['knifevolley', 'markedOpening'], 2400)?.text).toBe('注目会心')
    feedback.retain(new Set([1, 3]))
    expect(feedback.take(2, ['slowFollowup'], 2450)?.text).toBe('鈍化追撃')
    feedback.clear()
    expect(feedback.take(1, ['wardCounter'], 0)?.text).toBe('結界反撃')
  })
  it('separates simultaneous numbers over adjacent targets and keeps them inside the canvas', () => {
    const occupied: LabelBox[] = []
    for (const center of [100, 100, 104, 102, 100, 115, 1, 199]) {
      const box = placeCombatLabel(center, 70, 22, 16, 200, occupied)
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(2)
      expect(box!.x + box!.width).toBeLessThanOrEqual(198)
      for (const previous of occupied) expect(box!.x >= previous.x + previous.width || box!.x + box!.width <= previous.x || box!.y >= previous.y + previous.height || box!.y + box!.height <= previous.y).toBe(true)
      occupied.push(box!)
    }
  })
  it('omits a number when no readable lane fits rather than drawing over existing text', () => {
    expect(placeCombatLabel(20, 12, 22, 16, 40, [])).toBeNull()
    expect(placeCombatLabel(20, 60, 40, 16, 40, [])).toBeNull()
    expect(placeCombatLabel(20, 60, 20, 10, 40, [{ x: 0, y: 0, width: 40, height: 60 }])).toBeNull()
  })
  it('gives legendary and mythic visibly different local celebrations with finite durations', () => {
    const ordinary = lootPresentation(2), legendary = lootPresentation(4), mythic = lootPresentation(5)
    expect(ordinary.pillarHeight).toBe(0)
    expect(legendary.pillarHeight).toBeGreaterThan(0)
    expect(mythic.pillarHeight).toBeGreaterThan(legendary.pillarHeight)
    expect(mythic.hold).toBeGreaterThan(legendary.hold)
    expect(mythic.aura).not.toBe(legendary.aura)
    expect(legendary.chestScale).toBe(2)
    expect(mythic.chestScale).toBe(3)
    for (let rarity = 0; rarity <= 5; rarity++) {
      const cue = lootPresentation(rarity)
      expect(cue.hold).toBeLessThan(cue.duration)
      expect(cue.duration).toBeLessThanOrEqual(3000)
    }
    expect(() => lootPresentation(6)).toThrow('Unknown loot rarity')
  })
})
