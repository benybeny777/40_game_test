import { growthBalance } from '../data/growth.ts'
import type { GearStats } from './types.ts'
import { rarities, legacyRarityMultipliers } from '../data/items.ts'



/** Stored rolls stay intact. Combat and equipment descriptions share these effective values. */
export function gearContribution(item: Pick<GearStats, 'atk' | 'hp' | 'def' | 'rarity' | 'rollVersion'>) {
  // Explicit compatibility for rolls from before rarity rebalancing. Never reroll
  // saved affixes, requirements or base-roll quality; new rolls already include it.
  const rarityScale = item.rollVersion === undefined && item.rarity !== undefined
    ? rarities[item.rarity].mul / legacyRarityMultipliers[item.rarity] : 1
  return { atk: item.atk * growthBalance.equipment.atk * rarityScale,
    hp: item.hp * growthBalance.equipment.hp * rarityScale, def: item.def * growthBalance.equipment.def * rarityScale }
}
