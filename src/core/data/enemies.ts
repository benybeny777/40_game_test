import type { Stats, AttackDef } from '../sim/types.ts'
import { balance } from './balance.ts'

export type BossSkill =
  | { kind: 'frontStrike'; id: string; name: string; cooldownMs: number; mul: number; targets: number }   // 金棒振り
  | { kind: 'summon'; id: string; name: string; cooldownMs: number; summon: string; count: number; maxAlive: number }  // 手下を呼ぶ
  | { kind: 'randomStrike'; id: string; name: string; cooldownMs: number; mul: number; targets: number }  // 狐火
export interface BossDef {
  skill: BossSkill
  enrageInterval: number
  phantoms?: { id: string; atHp: number; count: number; hpRatio: number }
}
export interface Traits {
  double?: boolean                             // 化け猫：0.5倍を2回
  split?: { child: string; hpRatio: number }   // バグ精霊：初回撃破で2体に分裂
  backline?: boolean                           // 呪いのフィギュア：最後尾を狙う
  explode?: { mul: number; targets: number }   // ポップアップ鬼：先頭に触れたら自爆
  goldBag?: boolean                            // 招き猫もどき：小判が多い（表示だけ）
}
export interface EnemyDef {
  id: string; name: string; desc: string; area: number; base: Stats; speed: number; exp: number; koban: number
  armored: boolean; attack: AttackDef; boss?: BossDef; traits: Traits
  hidden?: boolean                             // 図鑑に載せない派生ユニット
  sprite?: string                              // 別の敵のドット絵を使う
}
interface Spec { area: number; hp: number; atk: number; def: number; interval: number; eva: number; speed: number; range: number
  exp: number; koban: number; ranged?: boolean; armored?: boolean; projectile?: string; traits?: Traits; boss?: BossDef; hidden?: boolean; sprite?: string }
/** All values are stage-1 equivalents; world.ts scales HP/ATK/DEF and rewards by the stage number (05-content-balance.md §1). */
const enemy = (id: string, name: string, desc: string, spec: Spec): EnemyDef => ({
  id, name, desc, area: spec.area, speed: spec.speed, exp: spec.exp, koban: spec.koban, armored: spec.armored ?? false,
  traits: spec.traits ?? {}, boss: spec.boss, hidden: spec.hidden, sprite: spec.sprite,
  base: { maxHp: spec.hp, atk: spec.atk, def: spec.def, intervalMs: spec.interval, cri: 0, criMul: balance.criMulBase, eva: spec.eva, luk: 0,
    rangeDots: spec.range, dmgTakenMul: 1, kobanMul: 1, dropMul: 1, cooldownMul: 1 },
  attack: { kind: spec.ranged ? 'ranged' : 'melee', mul: 1, projectile: spec.ranged ? spec.projectile ?? 'fireball' : undefined, targeting: 'random' },
})
const melee = balance.meleeRange
export const enemies: Record<string, EnemyDef> = {
  // エリア1 夜の街道
  chochin: enemy('chochin', '提灯お化け', '夜道をふらふら漂う古提灯。', { area: 1, hp: 80, atk: 9, def: 2, interval: 1400, eva: 0, speed: 14, range: melee, exp: 3, koban: 2 }),
  kappa: enemy('kappa', '河童', '甲羅が硬く、会心が通りにくい。', { area: 1, hp: 140, atk: 7.5, def: 6, interval: 1600, eva: 0, speed: 10, range: melee, exp: 4, koban: 3, armored: true }),
  onibi: enemy('onibi', '鬼火', '離れたところから火の玉を飛ばす。', { area: 1, hp: 50, atk: 7.5, def: 0, interval: 1000, eva: 0.1, speed: 20, range: 110, exp: 3, koban: 2, ranged: true }),
  ooni: enemy('ooni', '大鬼', '街道の主。金棒で前の二人をまとめて殴る。', { area: 1, hp: 1185, atk: 9.5, def: 5, interval: 1800, eva: 0, speed: 10, range: melee, exp: 40, koban: 27,
    boss: { skill: { kind: 'frontStrike', id: 'kanabo', name: '金棒振り', cooldownMs: 8000, mul: 2, targets: 2 }, enrageInterval: 0.8 } }),
  // エリア2 シャッター商店街
  karakasa: enemy('karakasa', '唐傘おばけ', 'ひらひらとよける一本足の傘。', { area: 2, hp: 90, atk: 10.5, def: 2, interval: 1300, eva: 0.3, speed: 16, range: melee, exp: 4, koban: 3 }),
  bakeneko: enemy('bakeneko', '化け猫', '素早い爪で二回ひっかく。', { area: 2, hp: 80, atk: 7.5, def: 2, interval: 1000, eva: 0.05, speed: 22, range: melee, exp: 4, koban: 3, traits: { double: true } }),
  manekimodoki: enemy('manekimodoki', '招き猫もどき', '倒すと小判がざくざく出る。', { area: 2, hp: 120, atk: 4.5, def: 3, interval: 1800, eva: 0, speed: 12, range: melee, exp: 3, koban: 12, traits: { goldBag: true } }),
  manekitaisho: enemy('manekitaisho', '招き猫大将', '商店街の主。手下の招き猫を呼び続ける。', { area: 2, hp: 1500, atk: 10, def: 8, interval: 1600, eva: 0, speed: 10, range: melee, exp: 45, koban: 80,
    boss: { skill: { kind: 'summon', id: 'shoufuku', name: '千客万来', cooldownMs: 12000, summon: 'manekimodoki', count: 2, maxAlive: 4 }, enrageInterval: 0.8 } }),
  // エリア3 電脳街
  bugsei: enemy('bugsei', 'バグ精霊', '倒すと小さく分裂する。', { area: 3, hp: 52, atk: 5, def: 1, interval: 1200, eva: 0.1, speed: 18, range: 100, exp: 4, koban: 3, ranged: true, projectile: 'glitch',
    traits: { split: { child: 'bugsei_child', hpRatio: 0.4 } } }),
  bugsei_child: enemy('bugsei_child', 'バグ精霊（小）', '分裂した欠片。', { area: 3, hp: 52, atk: 3.3, def: 1, interval: 1200, eva: 0.1, speed: 22, range: 100, exp: 1, koban: 1, ranged: true, projectile: 'glitch', hidden: true, sprite: 'bugsei' }),
  noroifig: enemy('noroifig', '呪いのフィギュア', 'その場から動かず、後ろの仲間を狙い撃つ。', { area: 3, hp: 75, atk: 7.4, def: 3, interval: 1600, eva: 0, speed: 0, range: 200, exp: 5, koban: 4, ranged: true, projectile: 'curse',
    traits: { backline: true } }),
  popuponi: enemy('popuponi', 'ポップアップ鬼', '先頭に飛びついて自爆する。近づく前に倒したい。', { area: 3, hp: 45, atk: 16.5, def: 0, interval: 1000, eva: 0, speed: 30, range: melee, exp: 4, koban: 3,
    traits: { explode: { mul: 1, targets: 2 } } }),
  denno_kyubi: enemy('denno_kyubi', '電脳九尾', '電脳街の主。狐火を三つ放ち、弱ると幻影を生む。', { area: 3, hp: 1440, atk: 7.7, def: 9, interval: 1400, eva: 0.05, speed: 12, range: melee, exp: 50, koban: 40,
    boss: { skill: { kind: 'randomStrike', id: 'kitsunebi', name: '狐火', cooldownMs: 10000, mul: 1.2, targets: 3 }, enrageInterval: 0.8,
      phantoms: { id: 'kyubi_phantom', atHp: 0.5, count: 2, hpRatio: 0.15 } } }),
  kyubi_phantom: enemy('kyubi_phantom', '九尾の幻影', '本体の影。', { area: 3, hp: 1800, atk: 11, def: 0, interval: 1400, eva: 0, speed: 14, range: melee, exp: 0, koban: 0, hidden: true, sprite: 'denno_kyubi' }),
}
