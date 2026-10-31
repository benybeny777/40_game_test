import { slots, type SlotId } from './items.ts'
import { areaOf } from './stages.ts'

export const AREA_LOOT_MULTIPLIER = 2
export const favoredLootSlots = ['armor', 'weapon', 'charm'] as const satisfies readonly SlotId[]
export interface LootTendency {
  areaNo: number
  areaName: string
  favoredSlot: SlotId
  weights: Readonly<Record<SlotId, number>>
}

/** Area follows the actual basement floor, not the cross-difficulty equipment rank. */
export function lootTendency(floor: number): LootTendency {
  if (!Number.isSafeInteger(floor) || floor < 1) throw new RangeError('Invalid loot floor')
  const area = areaOf(floor), favoredSlot = favoredLootSlots[area.no - 1]
  if (!favoredSlot) throw new Error(`Missing loot tendency for area ${area.no}`)
  const weight = (slot: SlotId) => slots[slot].weight * (slot === favoredSlot ? AREA_LOOT_MULTIPLIER : 1)
  return { areaNo: area.no, areaName: area.name, favoredSlot,
    weights: { weapon: weight('weapon'), armor: weight('armor'), charm: weight('charm') } }
}
