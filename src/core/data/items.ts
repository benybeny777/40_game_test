import type { JobId } from '../sim/types.ts'

export type SlotId = 'weapon' | 'armor' | 'charm'
export type Rarity = 0 | 1 | 2 | 3 | 4
export type AffixKey = 'atkPct' | 'hpPct' | 'defPct' | 'intervalPct' | 'cri' | 'criMul' | 'eva' | 'luk' | 'kobanPct' | 'cooldownPct' | 'dropPct'

export const slots: Record<SlotId, { name: string; weight: number }> = {
  weapon: { name: '武器', weight: 40 }, armor: { name: '防具', weight: 35 }, charm: { name: 'お守り', weight: 25 },
}
export const rarities: Array<{ name: string; color: string; weight: number; mul: number; affixes: number; sell: number }> = [
  { name: '並', color: '#b9c0d0', weight: 70, mul: 1, affixes: 0, sell: 1 },
  { name: '上', color: '#7fd65a', weight: 22, mul: 1.1, affixes: 1, sell: 3 },
  { name: '特上', color: '#6fa8ff', weight: 6, mul: 1.25, affixes: 2, sell: 10 },
  { name: '極', color: '#c58cff', weight: 1.8, mul: 1.45, affixes: 3, sell: 40 },
  { name: '伝説', color: '#ffd54a', weight: 0.2, mul: 1.7, affixes: 3, sell: 200 },
]
/** Affix value ranges at 並. `scale` affixes also grow with item level. */
export const affixes: Record<AffixKey, { name: string; min: number; max: number; percent: boolean; scale?: boolean }> = {
  atkPct: { name: '攻撃', min: 0.03, max: 0.08, percent: true },
  hpPct: { name: '最大HP', min: 0.04, max: 0.10, percent: true },
  defPct: { name: '防御', min: 0.04, max: 0.10, percent: true },
  intervalPct: { name: '攻撃間隔', min: -0.06, max: -0.02, percent: true },
  cri: { name: '会心率', min: 0.01, max: 0.04, percent: true },
  criMul: { name: '会心倍率', min: 0.05, max: 0.15, percent: true },
  eva: { name: '回避', min: 0.01, max: 0.03, percent: true },
  luk: { name: '運', min: 1, max: 4, percent: false, scale: true },
  kobanPct: { name: '獲得小判', min: 0.03, max: 0.10, percent: true },
  cooldownPct: { name: 'スキル再使用', min: -0.08, max: -0.03, percent: true },
  dropPct: { name: 'ドロップ率', min: 0.02, max: 0.06, percent: true },
}
// Names change every 5 item levels (03-progression-save.md §3.2). The last entry repeats beyond the table.
export const weaponNames: Record<JobId, string[]> = {
  samurai: ['錆び刀', '打刀', '名刀・無銘'],
  ninja: ['苦無', '八方手裏剣', '影縫い'],
  jirai: ['ハートの手鏡', '量産リボン杖', '激重ハサミ'],
  otaku: ['ペンライト', '推し色サイリウム', '痛うちわ'],
  pachipro: ['玉の箱', '千発箱', '黄金のドル箱'],
}
export const armorNames = ['着流し', '鎖帷子', '陣羽織']
export const charmNames = ['交通安全守', '学業成就守', '金運招福守']
export const itemBalance = {
  dropChance: 0.03, bossMinRarity: 1 as Rarity, growth: 1.12, nameBand: 5,
  weaponAtk: 3, jobAtkMul: { samurai: 1.2, ninja: 1, jirai: 1.2, otaku: 0.7, pachipro: 1 } as Record<JobId, number>,
  armorHp: 15, armorDef: 2, charmExtraAffix: 1,
  lukRarityDiv: 500, pachiLukDrop: 0.0005, lukScalePerIlvl: 0.1,
  sellBase: 5, sellGrowth: 1.15, inventoryMax: 100,
  offlineDropEveryMs: 10 * 60 * 1000, offlineMaxRarity: 1 as Rarity,
}
/** Auto-equip / ↑↓ comparison weights per job: what each role values (03-progression-save.md §3.4). */
export const gearWeights: Record<JobId, { dps: number; tank: number; luk: number; koban: number; cooldown: number }> = {
  samurai: { dps: 1, tank: 0.08, luk: 0, koban: 0, cooldown: 2 },
  ninja: { dps: 1, tank: 0.04, luk: 0, koban: 0, cooldown: 2 },
  jirai: { dps: 1, tank: 0.04, luk: 0, koban: 0, cooldown: 3 },
  otaku: { dps: 0.6, tank: 0.06, luk: 0, koban: 0, cooldown: 6 },
  pachipro: { dps: 0.8, tank: 0.04, luk: 0.3, koban: 20, cooldown: 3 },
}
