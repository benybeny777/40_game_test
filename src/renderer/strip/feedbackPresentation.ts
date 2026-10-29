import { enemies } from '../../core/data/enemies.ts'
import type { SnapshotUnit } from '../../core/sim/types.ts'

/** Events may outlive their actor when a frame batches tell, death, and next-wave reset. */
export function bossCue(skillId: string, actor?: Pick<SnapshotUnit, 'side' | 'defId'>) {
  const owner = Object.values(enemies).find(enemy => enemy.boss?.skill.id === skillId)
  if (!owner?.boss) throw new Error(`Unknown boss skill: ${skillId}`)
  return { skill: owner.boss.skill, attack: owner.attack, actorPresent: actor?.side === 'enemy' && actor.defId === owner.id }
}

export interface LabelBox { x: number; y: number; width: number; height: number }
const intersects = (a: LabelBox, b: LabelBox) => a.x < b.x + b.width + 2 && a.x + a.width + 2 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y

const synergyLabels = {
  markedOpening: { text: '注目会心', color: '#f2b5dc' },
  slowFollowup: { text: '鈍化追撃', color: '#b4d9f4' },
  wardCounter: { text: '結界反撃', color: '#bee5bd' },
} as const
type SynergyTag = keyof typeof synergyLabels
const synergyTag = (tag: string): tag is SynergyTag => Object.hasOwn(synergyLabels, tag)

/** Show each source/combo once per short burst, including multihit skills and rapid counters. */
export class SynergyFeedback {
  private recent = new Map<number, Partial<Record<SynergyTag, number>>>()
  take(sourceUid: number, tags: readonly string[] | undefined, now: number) {
    const tag = tags?.find(synergyTag)
    if (!tag) return undefined
    const recent = this.recent.get(sourceUid) ?? {}
    const previous = recent[tag]
    if (previous !== undefined && now - previous < 2400) return undefined
    recent[tag] = now; this.recent.set(sourceUid, recent)
    return synergyLabels[tag]
  }
  retain(uids: ReadonlySet<number>) { for (const uid of this.recent.keys()) if (!uids.has(uid)) this.recent.delete(uid) }
  clear() { this.recent.clear() }
}

/** Pick a nearby, integer-pixel lane; omit low-value clutter when every lane is occupied. */
export function placeCombatLabel(centerX: number, baseline: number, width: number, height: number, viewport: number, occupied: readonly LabelBox[]): LabelBox | null {
  if (width > viewport - 4) return null
  for (let row = 0; row < 5; row++) {
    const y = Math.round(baseline - height - row * (height + 5))
    if (y < 2) break
    for (const offset of [0, -width - 4, width + 4]) {
      const x = Math.max(2, Math.min(viewport - width - 2, Math.round(centerX - width / 2 + offset)))
      const candidate = { x, y, width, height }
      if (!occupied.some(box => intersects(candidate, box))) return candidate
    }
  }
  return null
}

/** Local loot celebration: colour, height and hold distinguish legendary/mythic without screen flashes. */
export function lootPresentation(rarity: number) {
  if (!Number.isInteger(rarity) || rarity < 0 || rarity > 5) throw new Error(`Unknown loot rarity: ${rarity}`)
  return rarity === 5
    ? { duration: 2800, hold: 1900, pillarHeight: 56, pillarWidth: 12, sparkles: 8, aura: '#c28bff', core: '#fff4ff', chestScale: 3 }
    : rarity === 4
      ? { duration: 2200, hold: 1300, pillarHeight: 40, pillarWidth: 8, sparkles: 5, aura: '#ffc744', core: '#fff4bd', chestScale: 2 }
      : { duration: 1400, hold: 700, pillarHeight: 0, pillarWidth: 0, sparkles: 0, aura: '', core: '', chestScale: 1 }
}
