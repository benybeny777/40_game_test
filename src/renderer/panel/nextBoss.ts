import type { ProfileView } from '../../core/index.ts'
import { difficulties } from '../../core/data/dungeon.ts'
import { roleLabels } from '../../core/data/jobs.ts'
import { nextBoss } from '../../shared/nextBoss'
import { registerTranslations, registerTranslationTemplates, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'
import './nextBoss.css'
import { renderBossPhase } from './bossPhase'

registerTranslations({
  '対策の選択肢': 'Options to prepare',
  '技の型は進行帯と難度で変わります。次に使う技を確認して編成しましょう。': 'Skill patterns vary by progression and difficulty. Prepare for the skill shown here.',
  '取り巻きには範囲攻撃を持つ仲間が有効です。': 'Companions with area attacks can handle the additional enemies.',
})
registerTranslationTemplates([
  { ja: 'この先の大ボス：{difficulty} B{depth}', en: 'Upcoming boss: {difficulty} B{depth}' },
  { ja: '移動先の大ボス：{difficulty} B{depth}', en: 'Boss after queued travel: {difficulty} B{depth}' },
])

export function renderNextBoss(view: ProfileView) {
  const destination = view.dungeon.pendingTravel
  const boss = nextBoss(destination?.depth ?? view.dungeon.depth, destination?.difficulty ?? view.dungeon.difficulty)
  if (!boss) return null
  return h('aside', { class: 'next-boss' },
    h('div', {}, h('small', {}, `${destination ? '移動先の大ボス' : 'この先の大ボス'}：${tr(difficulties[boss.difficulty].name)} B${boss.floor}`),
      h('strong', {}, boss.name), h('small', {}, boss.skill.name), h('p', {}, boss.guide.tactic), renderBossPhase(boss.secondPhase)),
    h('details', {}, h('summary', { 'data-focus-key': 'next-boss-preparation' }, '対策の選択肢'),
      h('p', {}, '技の型は進行帯と難度で変わります。次に使う技を確認して編成しましょう。'),
      h('p', {}, boss.roles.map(role => tr(roleLabels[role])).join(' / ')),
      boss.areaDamage ? h('p', {}, '取り巻きには範囲攻撃を持つ仲間が有効です。') : null))
}
