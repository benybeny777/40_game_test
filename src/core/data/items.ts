import type { JobId } from '../sim/types.ts'

export type SlotId = 'weapon' | 'armor' | 'charm'
export type Rarity = 0 | 1 | 2 | 3 | 4 | 5
export type AffixKey = 'atkPct' | 'hpPct' | 'defPct' | 'intervalPct' | 'cri' | 'criMul' | 'eva' | 'luk' | 'kobanPct' | 'cooldownPct' | 'dropPct' | 'dmgTakenPct'

export const slots: Record<SlotId, { name: string; weight: number }> = {
  weapon: { name: '武器', weight: 40 }, armor: { name: '防具', weight: 35 }, charm: { name: 'お守り', weight: 25 },
}
export const rarities: Array<{ name: string; color: string; weight: number; mul: number; affixes: number; sell: number }> = [
  { name: '並', color: '#b9c0d0', weight: 70, mul: 1, affixes: 0, sell: 1 },
  { name: '上', color: '#7fd65a', weight: 22, mul: 1.1, affixes: 1, sell: 3 },
  { name: '特上', color: '#6fa8ff', weight: 6, mul: 1.25, affixes: 2, sell: 10 },
  { name: '極', color: '#c58cff', weight: 1.8, mul: 1.45, affixes: 3, sell: 40 },
  { name: '伝説', color: '#ffd54a', weight: 0.2, mul: 1.7, affixes: 3, sell: 200 },
  { name: '神話', color: '#ff9966', weight: 0.03, mul: 2, affixes: 4, sell: 500 },
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
  dmgTakenPct: { name: '被ダメージ', min: -0.06, max: -0.02, percent: true },
  dropPct: { name: 'ドロップ率', min: 0.02, max: 0.06, percent: true },
}
// Names change every 5 item levels (03-progression-save.md §3.2). The last entry repeats beyond the table.
export const weaponNames: Record<JobId, string[]> = {
  samurai: ['錆び刀', '打刀', '名刀・無銘'],
  ninja: ['苦無', '八方手裏剣', '影縫い'],
  jirai: ['ハートの手鏡', '量産リボン杖', '激重ハサミ'],
  otaku: ['ペンライト', '推し色サイリウム', '痛うちわ'],
  pachipro: ['玉の箱', '千発箱', '黄金のドル箱'],
  miko: ['紙の御幣', '白木の御幣', '神楽の御幣'],
  bancho: ['拳帯', '鉄拳グローブ', '総長の拳'],
  gyaru: ['デコスマホ', '盛りスマホ', '伝説のデコスマホ'],
  sukeban: ['木刀', '樫の木刀', '夜露死苦木刀'],
  farmer: ['竹槍', '節竹の槍', '豊穣の竹槍'],
  maid: ['仕込みナイフ', '銀の投げナイフ', '三日月ナイフ'],
  jiangshi: ['紙の霊符', '朱印の霊符', '鎮魂の霊符'],
  vagabond: ['拾った空き缶', '道具の寄せ集め', '掘り出し物の道具箱'],
  rikishi: ['稽古の手甲', '土俵の手甲', '横綱の手甲'],
  sister: ['祈祷書', '銀装の祈祷書', '祝福の祈祷書'],
  tono: ['紙の扇子', '金縁の扇子', 'あっぱれの扇子'],
  gariben: ['古い参考書', '書き込み参考書', '秘伝の問題集'],
}
export const armorNames = ['着流し', '鎖帷子', '陣羽織']
export const charmNames = ['交通安全守', '学業成就守', '金運招福守']
export const itemBalance = {
  baseRollMin: 0.85, baseRollMax: 1.15, uniqueRarity: 5 as Rarity, maxIlvl: 60, dropChance: 0.03, bossMinRarity: 1 as Rarity, growth: 1.12, nameBand: 5,
  weaponAtk: 3, jobAtkMul: { samurai: 1.2, ninja: 1, jirai: 1.2, otaku: 0.7, pachipro: 1, miko: 0.7, bancho: 1.1, gyaru: 0.8, sukeban: 1.2, farmer: 1, maid: 0.9, jiangshi: 1.1, vagabond: 0.8, rikishi: 1.1, sister: 0.7, tono: 0.6, gariben: 0.7 } as Record<JobId, number>,
  armorHp: 15, armorDef: 2, charmExtraAffix: 1,
  lukRarityDiv: 500, pachiLukDrop: 0.0005, lukScalePerIlvl: 0.1,
  sellBase: 5, sellGrowth: 1.15, inventoryMax: 100,
  offlineDropEveryMs: 10 * 60 * 1000, offlineMaxRarity: 1 as Rarity,
}
/** Auto-equip / ↑↓ comparison weights per job: what each role values (03-progression-save.md §3.4). */
export interface UniqueDef { name: string; slot: SlotId; main?: 'str' | 'dex' | 'int'; requirements: import('./attributes.ts').Attributes; atkMul: number; hpMul: number; defMul: number; affixes: Array<{ k: AffixKey; v: number }>; build: string }
export const uniqueDefs: Record<string, UniqueDef> = {
  titan: { name: '巨神の断ち刃', slot: 'weapon', main: 'str', requirements: { str: 100, dex: 0, vit: 20, int: 0 }, atkMul: 2.5, hpMul: 1, defMul: 1,
    affixes: [{ k: 'atkPct', v: 0.3 }, { k: 'intervalPct', v: 0.35 }], build: '筋力極振り：強烈な一撃。攻撃間隔が長くなる' },
  gale: { name: '疾風の牙', slot: 'weapon', main: 'dex', requirements: { str: 0, dex: 100, vit: 10, int: 0 }, atkMul: 1.3, hpMul: 1, defMul: 1,
    affixes: [{ k: 'intervalPct', v: -0.35 }, { k: 'cri', v: 0.15 }], build: '敏捷極振り：高速会心。単発威力は重量武器に劣る' },
  oracle: { name: '星詠みの聖具', slot: 'weapon', main: 'int', requirements: { str: 0, dex: 0, vit: 20, int: 100 }, atkMul: 1.6, hpMul: 1, defMul: 1,
    affixes: [{ k: 'cooldownPct', v: -0.4 }, { k: 'intervalPct', v: 0.15 }], build: '知力極振り：スキルと回復を高速回転。通常攻撃は遅い' },
  bastion: { name: '不沈の鎧', slot: 'armor', requirements: { str: 15, dex: 0, vit: 110, int: 0 }, atkMul: 1, hpMul: 3, defMul: 3,
    affixes: [{ k: 'dmgTakenPct', v: -0.2 }, { k: 'atkPct', v: -0.15 }, { k: 'intervalPct', v: 0.2 }], build: '体力極振り：圧倒的な耐久。攻撃力と手数を犠牲にする' },
}
export const gearWeights: Record<JobId, { dps: number; tank: number; luk: number; koban: number; cooldown: number }> = {
  samurai: { dps: 1, tank: 0.08, luk: 0, koban: 0, cooldown: 2 },
  ninja: { dps: 1, tank: 0.04, luk: 0, koban: 0, cooldown: 2 },
  jirai: { dps: 1, tank: 0.04, luk: 0, koban: 0, cooldown: 3 },
  otaku: { dps: 0.6, tank: 0.06, luk: 0, koban: 0, cooldown: 6 },
  pachipro: { dps: 0.8, tank: 0.04, luk: 0.3, koban: 20, cooldown: 3 },
  miko: { dps: 0.5, tank: 0.07, luk: 0, koban: 0, cooldown: 6 },
  bancho: { dps: 0.8, tank: 0.12, luk: 0, koban: 0, cooldown: 3 },
  gyaru: { dps: 0.7, tank: 0.05, luk: 0, koban: 0, cooldown: 5 },
  sukeban: { dps: 1.1, tank: 0.08, luk: 0, koban: 0, cooldown: 3 },
  farmer: { dps: 1, tank: 0.04, luk: 0, koban: 0, cooldown: 3 },
  maid: { dps: 1.2, tank: 0.03, luk: 0, koban: 0, cooldown: 3 },
  jiangshi: { dps: 1.1, tank: 0.09, luk: 0, koban: 0, cooldown: 3 },
  vagabond: { dps: 0.6, tank: 0.03, luk: 0.1, koban: 15, cooldown: 4 },
  rikishi: { dps: 0.7, tank: 0.15, luk: 0, koban: 0, cooldown: 4 },
  sister: { dps: 0.5, tank: 0.05, luk: 0, koban: 0, cooldown: 6 },
  tono: { dps: 0.5, tank: 0.03, luk: 0, koban: 0, cooldown: 6 },
  gariben: { dps: 0.6, tank: 0.03, luk: 0, koban: 0, cooldown: 6 },
}
