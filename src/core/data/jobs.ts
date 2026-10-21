import type { AttackDef, JobId, Stats } from '../sim/types.ts'
import { balance } from './balance.ts'

export interface SkillDef { id: string; name: string; desc: string; cooldownMs?: number; params: Record<string, number> }
export interface JobDef {
  id: JobId; name: string; role: string; weapon: string; color: string; base: Stats
  growth: { hp: number; atk: number; def: number; cri: number; eva: number; luk: number }
  attack: AttackDef & { name: string }
  skill: SkillDef; passive: SkillDef; ultimate: SkillDef
}
const base = (hp: number, atk: number, def: number, intervalMs: number, cri: number, eva: number, luk: number, rangeDots: number): Stats => ({
  maxHp: hp, atk, def, intervalMs, cri, eva, luk, rangeDots, criMul: balance.criMulBase,
  dmgTakenMul: 1, kobanMul: 1, dropMul: 1, cooldownMul: 1,
})
// HP/ATK/DEF grow multiplicatively; CRI/EVA/LUK grow additively per level (01-core.md §7).
const growth = { hp: 0.10, atk: 0.09, def: 0.07, cri: 0.002, eva: 0.002, luk: 0.2 }
export const jobs: Record<JobId, JobDef> = {
  samurai: { id: 'samurai', name: 'サムライ', role: '前衛・攻撃と盾', weapon: '刀', color: '#6a86c8', growth,
    base: base(120, 12, 8, 1200, 0.1, 0.05, 5, balance.meleeRange),
    attack: { name: '斬撃', kind: 'melee', mul: 1, targeting: 'front' },
    skill: { id: 'iai', name: '居合', desc: '次の一撃が必ず会心になり、威力2.5倍', cooldownMs: 8000, params: { mul: 2.5 } },
    passive: { id: 'niou', name: '仁王立ち', desc: '先頭にいると狙われやすく、受けるダメージ−15%。HP50%以下で攻撃+30%', params: { aggro: 0.2, dmgTaken: -0.15, hpBelow: 0.5, atk: 0.3 } },
    ultimate: { id: 'issen', name: '一閃', desc: '敵全体に攻撃力×3', params: { mul: 3 } } },
  ninja: { id: 'ninja', name: '忍者', role: '速攻・回避', weapon: '忍具', color: '#e8483e', growth,
    base: base(80, 9, 4, 700, 0.15, 0.2, 8, balance.rangedRange),
    attack: { name: '手裏剣', kind: 'ranged', mul: 1, projectile: 'shuriken', targeting: 'lowestHp' },
    skill: { id: 'kage', name: '影分身', desc: '3秒間、回避率+50%', cooldownMs: 12000, params: { eva: 0.5, ms: 3000 } },
    passive: { id: 'kyusho', name: '急所突き', desc: 'HP30%以下の敵への会心率+25%', params: { hpBelow: 0.3, cri: 0.25 } },
    ultimate: { id: 'mijin', name: '微塵隠れ', desc: '敵全体に攻撃力×2.5、2秒間無敵', params: { mul: 2.5, ms: 2000 } } },
  jirai: { id: 'jirai', name: '地雷系', role: '呪い・範囲', weapon: '呪具', color: '#ff7ab8', growth,
    base: base(90, 14, 3, 1500, 0.05, 0.05, 5, balance.rangedRange),
    attack: { name: '病みハート弾', kind: 'ranged', mul: 1, projectile: 'heart', targeting: 'nearest' },
    skill: { id: 'mine', name: '地雷設置', desc: '敵の足元に地雷。踏まれると範囲に攻撃力×2.5', cooldownMs: 10000, params: { mul: 2.5 } },
    passive: { id: 'omoi', name: '重い愛', desc: '情念50以上で攻撃+25%、受けるダメージ+10%', params: { jonen: 50, atk: 0.25, dmgTaken: 0.1 } },
    ultimate: { id: 'lovebomb', name: '激重ラブボム', desc: '敵全体に攻撃力×(2＋情念÷50)。情念は0に', params: { mul: 2, jonenDiv: 50 } } },
  otaku: { id: 'otaku', name: 'オタク', role: '回復・応援', weapon: 'ペンライト', color: '#a8ff60', growth,
    base: base(85, 6, 4, 1300, 0.05, 0.05, 10, balance.rangedRange),
    attack: { name: 'ペンライト投げ', kind: 'ranged', mul: 0.8, projectile: 'penlight', targeting: 'nearest' },
    skill: { id: 'sashiire', name: '差し入れ', desc: 'HPの割合が一番低い仲間を回復（攻撃力×3＋最大HPの10%）', cooldownMs: 9000, params: { mul: 3, maxHp: 0.1, below: 0.9 } },
    passive: { id: 'oshi', name: '推しへの愛', desc: '戦闘開始時、仲間全体の攻撃+10%', params: { atk: 0.1 } },
    ultimate: { id: 'ouen', name: '全力応援', desc: '仲間全体のHPを30%回復し、8秒間攻撃間隔−20%', params: { heal: 0.3, interval: -0.2, ms: 8000 } } },
  pachipro: { id: 'pachipro', name: 'パチプロ', role: '運・経済', weapon: '玉入れ', color: '#e0b030', growth,
    base: base(85, 10, 4, 1100, 0.08, 0.05, 30, balance.rangedRange),
    attack: { name: '玉はじき', kind: 'ranged', mul: 0.5, projectile: 'ball', targeting: 'nearest' },
    skill: { id: 'kakuhen', name: '確変チャレンジ', desc: '当たれば10秒間、仲間全体の攻撃間隔−30%・小判+50%', cooldownMs: 10000,
      params: { chance: 0.125, lukChance: 0.001, maxChance: 1 / 3, interval: -0.3, koban: 0.5, ms: 10000, consolation: 3 } },
    passive: { id: 'kitaichi', name: '期待値計算', desc: '獲得小判+15%', params: { koban: 0.15 } },
    ultimate: { id: 'oatari', name: '大当たり', desc: '出目N（1〜7）で敵全体に攻撃力×N。7なら小判ボーナス', params: { max: 7, lukDiv: 100, bonus: 30 } } },
}
export const partyOrder: JobId[] = ['samurai', 'ninja', 'jirai', 'otaku', 'pachipro']
export const jobIds: readonly JobId[] = partyOrder
