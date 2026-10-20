import type { AttackDef, JobId, Stats } from '../sim/types.ts'
import { balance } from './balance.ts'

export interface JobDef {
  id: JobId; name: string; role: string; weapon: string; base: Stats
  growth: { hp: number; atk: number; def: number; cri: number; eva: number; luk: number }
  attack: AttackDef
}
const base = (hp: number, atk: number, def: number, intervalMs: number, cri: number, eva: number, luk: number, rangeDots: number): Stats => ({
  maxHp: hp, atk, def, intervalMs, cri, eva, luk, rangeDots, criMul: balance.criMulBase,
  dmgTakenMul: 1, kobanMul: 1, dropMul: 1, cooldownMul: 1,
})
const growth = { hp: 0.10, atk: 0.09, def: 0.07, cri: 0.002, eva: 0.002, luk: 0.2 }
export const jobs: Record<JobId, JobDef> = {
  samurai: { id: 'samurai', name: 'サムライ', role: '前衛', weapon: '刀', growth,
    base: base(120, 12, 8, 1200, 0.1, 0.05, 5, balance.meleeRange), attack: { kind: 'melee', mul: 1, targeting: 'front' } },
  ninja: { id: 'ninja', name: '忍者', role: '速攻', weapon: '忍具', growth,
    base: base(80, 9, 4, 700, 0.15, 0.2, 8, balance.rangedRange), attack: { kind: 'ranged', mul: 1, projectile: 'shuriken', targeting: 'lowestHp' } },
  jirai: { id: 'jirai', name: '地雷系', role: '呪い', weapon: '呪具', growth,
    base: base(90, 14, 3, 1500, 0.05, 0.05, 5, balance.rangedRange), attack: { kind: 'ranged', mul: 1, projectile: 'heart', targeting: 'nearest' } },
  otaku: { id: 'otaku', name: 'オタク', role: '回復・応援', weapon: 'ペンライト', growth,
    base: base(85, 6, 4, 1300, 0.05, 0.05, 10, balance.rangedRange), attack: { kind: 'ranged', mul: 0.8, projectile: 'penlight', targeting: 'nearest' } },
  pachipro: { id: 'pachipro', name: 'パチプロ', role: '運・経済', weapon: '玉入れ', growth,
    base: base(85, 10, 4, 1100, 0.08, 0.05, 30, balance.rangedRange), attack: { kind: 'ranged', mul: 0.5, projectile: 'ball', targeting: 'nearest' } },
}
export const partyOrder: JobId[] = ['samurai', 'ninja', 'jirai', 'otaku', 'pachipro']
