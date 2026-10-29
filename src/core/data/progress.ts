export type DojoKey = 'atk' | 'hp' | 'walk' | 'drop' | 'offline'
export const dojo: Record<DojoKey, { name: string; desc: string; per: number; max: number | null; cost: number }> = {
  atk: { name: '素振り', desc: '全員の攻撃力 +3%', per: 0.03, max: null, cost: 100 },
  hp: { name: '走り込み', desc: '全員の最大HP +4%', per: 0.04, max: null, cost: 100 },
  walk: { name: '早足', desc: '移動の速さ +5%', per: 0.05, max: 10, cost: 300 },
  drop: { name: '目利き', desc: '装備のドロップ率 +2%（割合）', per: 0.02, max: 20, cost: 500 },
  offline: { name: '夜回りの約束', desc: 'オフライン報酬の上限 +1時間', per: 60 * 60 * 1000, max: 8, cost: 1000 },
}
export const progressBalance = {
  dojoCostGrowth: 1.5,
  offlineMaxMs: 8 * 60 * 60 * 1000, offlineMinMs: 60 * 1000, offlineRate: 0.5,
  rateMinutes: 10, minuteMs: 60 * 1000,
  bossFirstKillBonus: 20,
  catchupLevelGap: 3, catchupPerLevel: 0.25, catchupMaxMultiplier: 3,
  autoFarmClears: 2,          // After an automatic farming loop (3 wipes in a row), retry the next stage after this many clears.
}
