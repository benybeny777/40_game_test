export const balance = {
  tickMs: 100, walkMs: 4000, waveClearMs: 1000, stageClearMs: 2000, wipeMs: 3000,
  bossIntroMs: 1500, spawnMs: 200, windupMs: 200, projectileDotsPerSecond: 240,
  formationGap: 18, spawnX: 160, enemyStop: 14, enemyGap: 10,
  meleeRange: 16, rangedRange: 220, waves: 10, maxStage: 5, maxLevel: 50,
  walkHealPerSecond: 0.02, clearHeal: 0.3, frontTargetChance: 0.7, wipeLoopThreshold: 3,
  criMulBase: 1.5, defBase: 100, defK: 2, variance: 0.1,
  ultFromDealt: 5, ultFromTaken: 50, maxGauge: 100, minIntervalMul: 0.3, maxEva: 0.75,
  stageHpGrowth: 1.18, stageAtkGrowth: 1.12, stageDefGrowth: 1.10, rewardGrowth: 1.15,
  waveGrowth: 0.03, armorCritBonusMul: 0.5, obsessionMul: 1.15, obsessionMs: 5000,
  shotsMin: 1, shotsMax: 3,
  rng: { increment: 0x6d2b79f5, shiftA: 15, shiftB: 7, shiftC: 14, mix: 61, divisor: 4294967296 },
} as const
