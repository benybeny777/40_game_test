import type { ProfileView } from '../../core/index.ts'
import { difficulties } from '../../core/data/dungeon.ts'
import { roleLabels } from '../../core/data/jobs.ts'
import { nextBoss } from '../../shared/nextBoss'
import { registerTranslations, registerTranslationTemplates, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'
import './nextBoss.css'
import { renderBossPhase } from './bossPhase'
import { bossClearReward, isFirstClear } from '../../core/progress/clearRewards.ts'
import { rarities } from '../../core/data/items.ts'

registerTranslations({
  '対策の選択肢': 'Options to prepare',
  '技の型は進行帯と難度で変わります。次に使う技を確認して編成しましょう。': 'Skill patterns vary by progression and difficulty. Prepare for the skill shown here.',
  '取り巻きには範囲攻撃を持つ仲間が有効です。': 'Companions with area attacks can handle the additional enemies.',
  '初回突破の報酬': 'First-clear reward',
  '初回報酬は獲得済み。再訪でも通常のドロップを狙えます。': 'First-clear reward already earned. Replay for regular drops.',
  '新着で比較できます。': 'Compare it in New finds.',
  '持ち物が満杯です。新しい報酬を含む未装備・未ロックの品が整理売却の対象になります。': 'Inventory full. Unequipped, unlocked items, including the new reward, are eligible for capacity sales.',
})
registerTranslationTemplates([
  { ja: 'この先の大ボス：{difficulty} B{depth}', en: 'Upcoming boss: {difficulty} B{depth}' },
  { ja: '移動先の大ボス：{difficulty} B{depth}', en: 'Boss after queued travel: {difficulty} B{depth}' },
  { ja: '{rarity}以上の装備 ×1', en: '1 piece of {rarity}-or-better equipment' },
  { ja: '突破すると「{difficulty}」が解放', en: 'Clear to unlock {difficulty}' },
])

export function renderNextBoss(view: ProfileView) {
  const destination = view.dungeon.pendingTravel
  const boss = nextBoss(destination?.depth ?? view.dungeon.depth, destination?.difficulty ?? view.dungeon.difficulty)
  if (!boss) return null
  const reward = bossClearReward(boss.floor)
  const first = isFirstClear(boss.floor, boss.difficulty, view.dungeon.unlockedDepths)
  return h('aside', { class: 'next-boss' },
    h('div', {}, h('small', {}, `${destination ? '移動先の大ボス' : 'この先の大ボス'}：${tr(difficulties[boss.difficulty].name)} B${boss.floor}`),
      h('strong', {}, boss.name), h('small', {}, boss.skill.name), h('p', {}, boss.guide.tactic), renderBossPhase(boss.secondPhase)),
    reward === null ? null : h('div', { class: 'boss-reward' },
      first ? h('p', {}, h('small', {}, '初回突破の報酬'), h('strong', {}, `${tr(rarities[reward].name)}以上の装備 ×1`))
        : h('p', {}, '初回報酬は獲得済み。再訪でも通常のドロップを狙えます。'),
      first ? h('p', { class: 'hint' }, view.inventoryCount >= view.inventoryMax
        ? '持ち物が満杯です。新しい報酬を含む未装備・未ロックの品が整理売却の対象になります。' : '新着で比較できます。') : null,
      first && boss.difficulty < 2 && boss.floor === difficulties[boss.difficulty].floorLimit
        ? h('p', {}, `突破すると「${tr(difficulties[boss.difficulty + 1].name)}」が解放`) : null),
    h('details', {}, h('summary', { 'data-focus-key': 'next-boss-preparation' }, '対策の選択肢'),
      h('p', {}, '技の型は進行帯と難度で変わります。次に使う技を確認して編成しましょう。'),
      h('p', {}, boss.roles.map(role => tr(roleLabels[role])).join(' / ')),
      boss.areaDamage ? h('p', {}, '取り巻きには範囲攻撃を持つ仲間が有効です。') : null))
}
