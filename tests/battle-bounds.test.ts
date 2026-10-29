import { describe, expect, it } from 'vitest'
import { battleSurfaceWidth } from '../src/renderer/strip/battleBounds'

describe('battle decoration bounds', () => {
  it('fills compact screens but keeps wide desktop ground and background near the party', () => {
    expect(battleSurfaceWidth(375, 100)).toBe(375)
    expect(battleSurfaceWidth(540, 150)).toBe(540)
    expect(battleSurfaceWidth(3840, 600)).toBe(765)
    expect(battleSurfaceWidth(1920, 300)).toBe(465)
  })
})
