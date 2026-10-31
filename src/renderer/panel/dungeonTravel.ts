import type { CommandResult, ProfileView } from '../../core/index.ts'
import { dungeonBalance, dungeons } from '../../core/data/dungeon.ts'

/** Unsaved form state belongs to this panel session, never to the player's save. */
export class DungeonTravelDraft {
  private scope = ''
  private draft: string | undefined
  value(dungeon: ProfileView['dungeon']) {
    const scope = `${dungeon.id}:${dungeon.difficulty}`
    if (scope !== this.scope) { this.scope = scope; this.draft = undefined }
    return this.draft ?? String(dungeon.depth)
  }
  edit(value: string) { this.draft = value }
  completed(result: CommandResult) { if (result.ok) this.draft = undefined }
}

/** Revisiting the current fight resets its wave, so it is not a harmless navigation action. */
export function canTravelTo(dungeon: ProfileView['dungeon'], depth: number, difficulty = dungeon.difficulty) {
  if (dungeon.pendingTravel?.depth === depth && dungeon.pendingTravel.difficulty === difficulty) return false
  return dungeon.town || depth !== dungeon.depth || difficulty !== dungeon.difficulty
}

/** One nearby unlocked floor per area, without enumerating an endless floor list. */
export function nearbyLootFloors(depth: number, best: number): Array<number | undefined> {
  const span = dungeonBalance.themeSpan, areas = dungeons.yomi.biomes.length, cycle = span * areas
  const block = Math.floor((depth - 1) / cycle)
  return dungeons.yomi.biomes.map((_, area) => {
    const candidates = [block - 1, block, block + 1].flatMap(index => {
      if (index < 0) return []
      const first = index * cycle + area * span + 1, last = Math.min(best, first + span - 1)
      if (!Number.isSafeInteger(first) || first > last) return []
      return [Math.max(first, Math.min(last, depth))]
    })
    return candidates.sort((a, b) => Math.abs(a - depth) - Math.abs(b - depth) || a - b)[0]
  })
}
