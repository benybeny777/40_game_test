import { progressionDepth, type Difficulty } from './dungeon.ts'
import { balance } from './balance.ts'
import { enemies, type BossSkill } from './enemies.ts'

export const BOSS_VARIATION_DEPTH = 50
export const BOSS_PATTERN_CHAPTER = 30
export const BOSS_MILESTONE_EVERY = 100
export const BOSS_MILESTONE_PHASE_HP = 0.5
// Equal unmitigated attack per second, including the cat's double strike and tick rounding.
const attackRate = (id: string) => {
  const enemy = enemies[id]
  return enemy.base.atk * enemy.attack.mul * (enemy.traits.double ? balance.doubleHitMul * 2 : 1)
    / (Math.ceil(enemy.base.intervalMs / balance.tickMs) * balance.tickMs)
}
export const MIXED_CAT_ATTACK_MUL = attackRate('manekimodoki') / attackRate('bakeneko')
export const lateBossPatterns: Record<string, { skill: BossSkill; description: string }> = {
  ooni: {
    skill: { ...enemies.ooni.boss!.skill, kind: 'frontStrike', id: 'kanabo_sweep', name: '金棒薙ぎ払い', mul: 1.4, targets: 3 },
    description: '金棒薙ぎ払い。前方三人を広く狙う代わりに一人への威力は控えめ。全体回復・結界で支えるか、力士の押し戻しで構えを崩す。',
  },
  manekitaisho: {
    skill: { ...enemies.manekitaisho.boss!.skill, kind: 'summon', id: 'shoufuku_mixed', name: '千客万来・曲芸隊', summon: 'manekimodoki', count: 2, maxAlive: 4,
      roster: [{ id: 'manekimodoki', atkMul: 1 }, { id: 'bakeneko', atkMul: MIXED_CAT_ATTACK_MUL }] },
    description: '千客万来・曲芸隊。招き猫もどきと攻撃力を抑えた化け猫を一体ずつ呼ぶ。手下は二種合わせて四体まで。範囲攻撃でまとめて減らすか、召喚の構えを中断する。',
  },
  denno_kyubi: {
    skill: { ...enemies.denno_kyubi.boss!.skill, kind: 'rearStrike', id: 'kitsunebi_rear', name: '背後の狐火', mul: 1.8, targets: 2 },
    description: '背後の狐火。隊列の後ろ二人へ狙いを絞る。一人への威力が高いため、後ろ二人にも耐久が必要。後衛の防具・回復を整え、詠唱の狙いを見て隊列を見直す。',
  },
}
/** Cycle existing patterns per chapter; each hundred-floor climax changes at half HP. */
export function bossPattern(enemyId: string, floor: number, depthRank: Difficulty, belowHalfHp = false) {
  const enemy = enemies[enemyId]
  if (!enemy?.boss) return undefined
  const later = lateBossPatterns[enemyId]
  const progress = progressionDepth(floor, depthRank)
  const milestone = floor % BOSS_MILESTONE_EVERY === 0
  const chapter = Math.floor((floor - BOSS_VARIATION_DEPTH) / BOSS_PATTERN_CHAPTER)
  const late = Boolean(later) && (milestone ? belowHalfHp
    : progress >= BOSS_VARIATION_DEPTH && (chapter + depthRank) % 2 === 0)
  const selected = late ? later : { skill: enemy.boss.skill, description: enemy.desc }
  return { ...selected, late, milestone, secondPhase: milestone ? later : undefined }
}
export function bossSkillById(enemyId: string, skillId: string): BossSkill | undefined {
  const initial = enemies[enemyId]?.boss?.skill, later = lateBossPatterns[enemyId]?.skill
  return initial?.id === skillId ? initial : later?.id === skillId ? later : undefined
}
export function bossSkillOwner(skillId: string) {
  for (const enemy of Object.values(enemies)) {
    const skill = bossSkillById(enemy.id, skillId)
    if (skill) return { enemy, skill }
  }
  return undefined
}
