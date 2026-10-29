export type Difficulty = 0 | 1 | 2
export type FloorFeature = 'none' | 'treasure' | 'altar'
export const dungeons = {
  yomi: { id: 'yomi', name: '黄泉の迷宮', floorCount: 100, biomes: ['古の地下墓地', '朽ちた商街', '禁術の書庫'] },
} as const
export const difficulties = [
  { id: 0, name: '通常', floorLimit: dungeons.yomi.floorCount, hp: 1, atk: 1, reward: 1 },
  { id: 1, name: '修羅', floorLimit: dungeons.yomi.floorCount, hp: 1.8, atk: 1.35, reward: 1.5 },
  { id: 2, name: '深淵', floorLimit: null, hp: 3, atk: 1.8, reward: 2 },
] as const
export type DungeonId = keyof typeof dungeons
export const dungeonBalance = {
  maxDifficulty: 2, maxDepth: Number.MAX_SAFE_INTEGER, bossEvery: 10, themeSpan: 5,
  hpLinear: 0.22, hpQuadratic: 0.012, atkLinear: 0.075, atkQuadratic: 0.001,
  defLinear: 0.045, rewardLinear: 0.12,
  softDepth: dungeons.yomi.floorCount, deepLogGrowth: 20, deepLogSpan: 20,
  eliteHp: 1.8, eliteAtk: 1.15,
  treasureChance: 0.12, altarChance: 0.1, treasureKoban: 20, treasureExp: 10, altarHeal: 0.5,
  featureHash: 2654435761, seedHash: 2246822519, hashDivisor: 4294967296,
  stageWindow: 5,
} as const
export const floorLimit = (difficulty: Difficulty) => difficulties[difficulty].floorLimit
export const maxFloor = (difficulty: Difficulty) => floorLimit(difficulty) ?? dungeonBalance.maxDepth
export const isBossFloor = (depth: number) => depth % dungeonBalance.bossEvery === 0
/** Displayed floors restart at B1; enemy strength and loot quality continue through difficulty tiers. */
export const progressionDepth = (depth: number, difficulty: Difficulty) => Math.min(dungeonBalance.maxDepth, depth + difficulty * dungeons.yomi.floorCount)
/** Polynomial through B100, then logarithmic: finite even at the last safe integer. */
export function depthScale(depth: number, difficulty: Difficulty = 0) {
  const b = dungeonBalance, progress = progressionDepth(depth, difficulty), n = Math.min(progress, b.softDepth) - 1
    + Math.log2(1 + Math.max(0, progress - b.softDepth) / b.deepLogSpan) * b.deepLogGrowth
  const d = difficulties[difficulty]
  return { hp: (1 + b.hpLinear * n + b.hpQuadratic * n * n) * d.hp,
    atk: (1 + b.atkLinear * n + b.atkQuadratic * n * n) * d.atk,
    def: 1 + b.defLinear * n, reward: (1 + b.rewardLinear * n) * d.reward }
}
export function floorFeature(depth: number, seed: number, difficulty: Difficulty = 0): FloorFeature {
  const b = dungeonBalance
  const mixed = (Math.imul(depth >>> 0, b.featureHash) ^ Math.imul(seed >>> 0, b.seedHash) ^ difficulty) >>> 0
  const roll = mixed / b.hashDivisor
  return roll < b.treasureChance ? 'treasure' : roll < b.treasureChance + b.altarChance ? 'altar' : 'none'
}
export const cappedAmount = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, value))
