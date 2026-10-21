import type { Stats, AttackDef } from '../sim/types.ts'
import { balance } from './balance.ts'
export interface BossDef {
  stage: number                                   // Stats below are the values at this stage number.
  skill: { id: string; name: string; cooldownMs: number; mul: number; targets: number }
  enrageInterval: number
}
export interface EnemyDef {
  id: string; name: string; desc: string; base: Stats; speed: number; exp: number; koban: number
  armored: boolean; attack: AttackDef; boss?: BossDef
}
const enemy = (id: string, name: string, desc: string, maxHp: number, atk: number, def: number, intervalMs: number, eva: number, speed: number, rangeDots: number, exp: number, koban: number, ranged = false, armored = false): EnemyDef => ({
  id, name, desc, speed, exp, koban, armored,
  base: { maxHp, atk, def, intervalMs, cri: 0, criMul: balance.criMulBase, eva, luk: 0, rangeDots, dmgTakenMul: 1, kobanMul: 1, dropMul: 1, cooldownMul: 1 },
  attack: { kind: ranged ? 'ranged' : 'melee', mul: 1, projectile: ranged ? 'fireball' : undefined, targeting: 'random' },
})
export const enemies: Record<string, EnemyDef> = {
  chochin: enemy('chochin', '提灯お化け', '夜道をふらふら漂う古提灯。', 80, 9, 2, 1400, 0, 14, balance.meleeRange, 3, 2),
  kappa: enemy('kappa', '河童', '甲羅が硬く、会心が通りにくい。', 140, 7.5, 6, 1600, 0, 10, balance.meleeRange, 4, 3, false, true),
  onibi: enemy('onibi', '鬼火', '離れたところから火の玉を飛ばす。', 50, 7.5, 0, 1000, 0.1, 20, 110, 3, 2, true),
  ooni: { ...enemy('ooni', '大鬼', '街道の主。金棒で前の二人をまとめて殴る。', 6000, 27, 6, 1800, 0, 10, balance.meleeRange, 70, 47),
    boss: { stage: 5, skill: { id: 'kanabo', name: '金棒振り', cooldownMs: 8000, mul: 2, targets: 2 }, enrageInterval: 0.8 } },
}
