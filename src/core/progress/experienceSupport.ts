import { balance } from '../data/balance.ts'
import { progressBalance } from '../data/progress.ts'

/** Same catch-up budget for combat rewards and prospective formation previews. */
export function experienceSupportMultiplier(level: number, veteranLevel: number): number {
  if (level >= balance.maxLevel) return 1
  return Math.min(progressBalance.catchupMaxMultiplier, 1 + Math.max(0, veteranLevel - progressBalance.catchupLevelGap - level) * progressBalance.catchupPerLevel)
}
