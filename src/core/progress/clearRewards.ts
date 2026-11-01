import { isBossFloor, maxFloor, type Difficulty } from '../data/dungeon.ts'
import type { Rarity } from '../data/items.ts'

/** Shared by reward settlement and its preview; reaching a floor is not clearing it. */
export function isFirstClear(floor: number, rank: Difficulty, unlocked: readonly number[]) {
  return floor >= unlocked[rank]
    && (rank === 2 ? floor < Number.MAX_SAFE_INTEGER : floor < maxFloor(rank) || unlocked[rank + 1] === 0)
}

export function bossClearReward(floor: number): Rarity | null {
  return isBossFloor(floor) ? floor % 100 === 0 ? 3 : 2 : null
}
