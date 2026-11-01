/** Growth supports equipment eligibility; it must not replace equipment. */
export const growthBalance = {
  earlyLevels: 10, lateLevelGrowth: 2, lateLevelSpan: 30,
  innateAttack: 0.2, innateHpGrowth: 0.1,
  attributeCaps: { mainAtk: 0.15, vitHp: 40, vitDef: 5, strDef: 3, dexInterval: 0.05, dexCri: 0.03, dexEva: 0.03 },
  equipment: { atk: 3, hp: 8, def: 3 },
  experienceSpan: 30, masteryStart: 60, masterySpan: 15,
} as const

export function effectiveGrowthLevels(level: number) {
  const early = growthBalance.earlyLevels - 1
  return Math.min(level - 1, early) + growthBalance.lateLevelGrowth * (1 - Math.exp(-Math.max(0, level - growthBalance.earlyLevels) / growthBalance.lateLevelSpan))
}
export const attributeBenefit = (points: number, perPoint: number, cap: number) => cap * points / (points + cap / perPoint)

export function experienceMultiplier(level: number) {
  return 1 + (Math.max(0, level - growthBalance.earlyLevels) / growthBalance.experienceSpan) ** 2
    + (Math.max(0, level - growthBalance.masteryStart) / growthBalance.masterySpan) ** 4
}
