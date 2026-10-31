import { enemies, type EnemyDef } from '../core/data/enemies.ts'
import { bossPattern } from '../core/data/bossPatterns.ts'
import type { Difficulty } from '../core/data/dungeon.ts'

export interface EnemyGuide { role: string; tactic: string }
/** Player-facing explanations of the actual enemy traits, shared by the codex and tooltips. */
export function enemyGuide(id: string, context?: { floor: number; depthRank: Difficulty }): EnemyGuide {
  const def: EnemyDef | undefined = enemies[id]
  if (!def) return { role: '不明', tactic: '' }
  const pattern = context ? bossPattern(id, context.floor, context.depthRank) : undefined
  if (pattern?.late) return { role: pattern.skill.kind === 'rearStrike' ? 'ボス・後衛狙い'
    : pattern.skill.kind === 'summon' ? 'ボス・召喚' : 'ボス・前列強打', tactic: pattern.description }
  if (def.boss?.skill.kind === 'frontStrike') return { role: 'ボス・前列強打', tactic: '金棒は前の二人を巻き込む。前列の防御と回復を整えよう。' }
  if (def.boss?.skill.kind === 'summon') return { role: 'ボス・召喚', tactic: '手下を呼び出す。範囲攻撃で取り巻きごと倒そう。' }
  if (def.boss?.phantoms) return { role: 'ボス・幻影', tactic: '体力半分で幻影が出現。全体攻撃とパーティの回復を用意しよう。' }
  if (def.traits.explode) return { role: '突進・自爆', tactic: '接近すると前列を巻き込んで自爆。遠距離攻撃で近づく前に倒そう。' }
  if (def.traits.backline) return { role: '後衛狙い', tactic: '後ろの仲間へ攻撃する。回復役の体力や防御も確保しよう。' }
  if (def.traits.split) return { role: '分裂・遠距離', tactic: '倒すと二つに分裂する。小さな欠片も倒すまで油断しない。' }
  if (def.traits.double) return { role: '速攻・連撃', tactic: '一度に二回ひっかく。前列の防御と被ダメージ軽減が役に立つ。' }
  if (def.traits.goldBag) return { role: '小判持ち', tactic: '攻撃は控えめだが小判を多く持つ。周回中の稼ぎどころ。' }
  if (def.armored) return { role: '装甲', tactic: '硬い甲羅は会心にも強い。攻撃力を上げて押し切ろう。' }
  if (def.base.eva >= 0.3) return { role: '回避', tactic: '攻撃をよくかわす。手数を増やし、回復しながら戦おう。' }
  if (def.attack.kind === 'ranged') return { role: '遠距離', tactic: '離れた位置から弾を放つ。前列の耐久と素早い攻撃で対抗しよう。' }
  return { role: '近接', tactic: '近づいて攻撃する。前列で受け止め、後ろから攻めよう。' }
}
