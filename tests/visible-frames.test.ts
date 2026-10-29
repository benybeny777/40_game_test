import { describe, expect, it } from 'vitest'
import { VisibleFrames } from '../src/renderer/strip/visibleFrames'
import type { Frame } from '../src/shared/api'
const frame = (tick: number): Frame => ({ snapshot: { tick } as Frame['snapshot'], events: [{ t: 'drop', x: 1, name: 'test', rarity: 5 }] })
describe('hidden strip presentation', () => {
  it('keeps only the latest hidden snapshot and discards historical effects on resumption', () => {
    const gate = new VisibleFrames()
    expect(gate.accept(frame(1))).toEqual({ frame: frame(1), fresh: false })
    gate.setVisible(false)
    expect(gate.shown).toBe(false)
    expect(gate.accept(frame(2))).toBeUndefined()
    expect(gate.accept(frame(9))).toBeUndefined()
    expect(gate.setVisible(true)).toEqual({ frame: { snapshot: { tick: 9 }, events: [] }, fresh: true })
    expect(gate.accept(frame(10))).toEqual({ frame: frame(10), fresh: false })
  })
  it('also resets when show state arrives before the first fresh host frame', () => {
    const gate = new VisibleFrames()
    gate.setVisible(false); gate.setVisible(true)
    expect(gate.shown).toBe(false)
    expect(gate.accept(frame(50))).toEqual({ frame: { snapshot: { tick: 50 }, events: [] }, fresh: true })
    expect(gate.shown).toBe(true)
    expect(gate.setVisible(true)).toBeUndefined()
    expect(gate.accept(frame(51))!.frame.events).toHaveLength(1)
  })
})
