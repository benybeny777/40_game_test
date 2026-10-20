import type { Stats, AttackDef } from '../sim/types.ts'
import { balance } from './balance.ts'
export interface EnemyDef { id: string; name: string; base: Stats; speed: number; exp: number; koban: number; armored: boolean; attack: AttackDef }
const enemy = (id: string, name: string, maxHp: number, atk: number, def: number, intervalMs: number, eva: number, speed: number, rangeDots: number, exp: number, koban: number, ranged = false, armored = false): EnemyDef => ({
  id, name, speed, exp, koban, armored,
  base: { maxHp, atk, def, intervalMs, cri: 0, criMul: balance.criMulBase, eva, luk: 0, rangeDots, dmgTakenMul: 1, kobanMul: 1, dropMul: 1, cooldownMul: 1 },
  attack: { kind: ranged ? 'ranged' : 'melee', mul: 1, projectile: ranged ? 'onibi' : undefined, targeting: 'random' },
})
export const enemies: Record<string, EnemyDef> = {
  chochin: enemy('chochin', '提灯お化け', 40, 6, 2, 1400, 0, 14, balance.meleeRange, 3, 2),
  kappa: enemy('kappa', '河童', 70, 5, 6, 1600, 0, 10, balance.meleeRange, 4, 3, false, true),
  onibi: enemy('onibi', '鬼火', 25, 5, 0, 1000, 0.1, 20, 110, 3, 2, true),
}
