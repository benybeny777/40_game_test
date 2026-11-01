import { dungeons } from './dungeon.ts'
export const balance = {
  tickMs: 100, walkMs: 600, waveClearMs: 300, stageClearMs: 800, wipeMs: 1800,
  bossIntroMs: 900, spawnMs: 100, windupMs: 100, projectileDotsPerSecond: 360,
  bossInterruptDots: 18,
  allyAttackIntervalMul: 0.5,
  allyAdvanceDotsPerSecond: 60,
  // spawnX was 160 in the first draft; ranged allies (220) then killed everything before melee contact.
  formationGap: 18, spawnX: 40, enemyStop: 14, enemyGap: 10,
  meleeRange: 16, rangedRange: 220, waves: 10, maxStage: dungeons.yomi.floorCount, maxLevel: 100,
  // Recovery budget is independent of presentation tempo; dojo still reduces its duration.
  walkRecoveryMs: 1200, walkHealPerSecond: 0.065, clearHeal: 0.3, frontTargetChance: 0.7, wipeLoopThreshold: 3,
  criMulBase: 1.5, defBase: 100, defK: 2, variance: 0.1,
  ultFromDealt: 5, ultFromTaken: 50, maxGauge: 100, minIntervalMul: 0.3, maxEva: 0.75,
  waveGrowth: 0.03, armorCritBonusMul: 0.5, obsessionMul: 1.15, obsessionMs: 5000,
  shotsMin: 1, shotsMax: 3,
  skillLv: 1, passiveLv: 5, ultLv: 10, ultCastMs: 600,
  mineArmMs: 500, mineFuseMs: 3000, mineTriggerDots: 6, mineRadiusDots: 24,
  jonenFromTaken: 50, enrageHp: 0.5, doubleHitMul: 0.5,
  expBase: 20, expPow: 1.6,
  rng: { increment: 0x6d2b79f5, shiftA: 15, shiftB: 7, shiftC: 14, mix: 61, divisor: 4294967296 },
} as const
