import { expect, it } from 'vitest'
import { bossClearReward, isFirstClear } from '../../src/core/progress/clearRewards'

it('distinguishes reaching a boss from clearing it and keeps difficulty rewards separate', () => {
  expect(isFirstClear(10, 0, [10, 0, 0])).toBe(true)
  expect(isFirstClear(10, 0, [11, 0, 0])).toBe(false)
  expect(isFirstClear(100, 0, [100, 0, 0])).toBe(true)
  expect(isFirstClear(100, 0, [100, 1, 0])).toBe(false)
  expect(isFirstClear(100, 1, [100, 100, 0])).toBe(true)
  expect(isFirstClear(100, 1, [100, 100, 1])).toBe(false)
  expect(isFirstClear(200, 2, [100, 100, 200])).toBe(true)
  expect(isFirstClear(200, 2, [100, 100, 201])).toBe(false)
})

it('uses the settled guarantee for ordinary bosses and hundred-floor milestones', () => {
  expect(bossClearReward(9)).toBeNull()
  expect(bossClearReward(10)).toBe(2)
  expect(bossClearReward(100)).toBe(3)
  expect(bossClearReward(110)).toBe(2)
  expect(bossClearReward(1000)).toBe(3)
})
