import type { AbyssClear, AbyssView } from '../../core/progress/abyss.ts'
import type { JobId } from '../../core/index.ts'
import { jobs } from '../../core/data/jobs.ts'
import { slots } from '../../core/data/items.ts'
import { registerTranslations, registerTranslationTemplates, translatedLabel, formatNumber } from '../../shared/i18n'
import { h } from './dom'

registerTranslations({
  '深淵の遠征録': 'Abyss expedition journal',
  '到達だけではなく、その階をクリアした編成を記録します。': 'Records the party that clears a floor, not just reaches it.',
  'B100・250・500・1000、その先は1000階ごとに新たな踏破目標が続きます。': 'Clear B100, 250, 500 and 1000, then pursue a new milestone every 1000 floors.',
  'まだ踏破編成の記録はありません。過去の編成は推測せず、次の深淵クリアから記録します。': 'No clearing party has been recorded yet. Records begin with your next Abyss clear; past parties are not reconstructed.',
  '最高記録の編成を見る': 'View the record-setting party',
  '節目の踏破記録': 'Milestone clears',
  '最新8件まで保存。配分と装備名は踏破時の記録です。現在の装備への復元操作ではありません。': 'Keeps up to eight recent milestones. Allocations and gear names are snapshots at the clear, not a way to restore equipment.',
  '記録可能な最高階へ到達しました。': 'You have reached the highest recordable floor.',
  '装備なし': 'None',
  '配分': 'Allocated',
})
registerTranslationTemplates([
  { ja: '次の踏破目標 B{floor}', en: 'Next clear goal: B{floor}' },
  { ja: '最高クリア B{floor}', en: 'Best clear: B{floor}' },
  { ja: '目標まであと{n}階', en: '{n} floors to the goal' },
  { ja: 'B{floor} 踏破時の編成', en: 'Party that cleared B{floor}' },
])

function recordedParty(clear: AbyssClear, portrait: (job: JobId) => Node) {
  return h('div', { class: 'abyss-party' }, ...clear.party.map(member => h('article', { class: 'abyss-member' },
    h('div', { class: 'abyss-member-heading' }, portrait(member.job),
      h('b', {}, `${translatedLabel(jobs[member.job].name)} · Lv ${member.lv}`)),
    h('p', {}, `${translatedLabel('配分')} STR ${member.allocated.str} / DEX ${member.allocated.dex} / VIT ${member.allocated.vit} / INT ${member.allocated.int}`),
    h('dl', {}, ...(['weapon', 'armor', 'charm'] as const).map(slot => h('div', {},
      h('dt', {}, slots[slot].name), h('dd', {}, member.equipment[slot] ?? '装備なし')))))))
}

export function renderAbyssRecords(record: AbyssView, portrait: (job: JobId) => Node) {
  const cleared = record.best?.floor ?? 0
  return h('section', { class: 'abyss-journal', 'aria-label': '深淵の遠征録' },
    h('span', { class: 'eyebrow' }, '深淵の遠征録'),
    h('h3', {}, record.nextGoal === null ? '記録可能な最高階へ到達しました。' : `次の踏破目標 B${formatNumber(record.nextGoal)}`),
    h('p', {}, `最高クリア B${formatNumber(cleared)}`),
    record.nextGoal === null ? null : h('div', { class: 'abyss-goal' },
      h('progress', { value: cleared, max: record.nextGoal, 'aria-label': `次の踏破目標 B${formatNumber(record.nextGoal)}` }),
      h('small', {}, `目標まであと${formatNumber(record.nextGoal - cleared)}階`)),
    h('p', { class: 'hint' }, 'B100・250・500・1000、その先は1000階ごとに新たな踏破目標が続きます。'),
    h('p', { class: 'hint' }, '到達だけではなく、その階をクリアした編成を記録します。'),
    record.best ? h('details', {}, h('summary', { 'data-focus-key': 'abyss-best' }, '最高記録の編成を見る'), recordedParty(record.best, portrait))
      : h('p', { class: 'hint' }, 'まだ踏破編成の記録はありません。過去の編成は推測せず、次の深淵クリアから記録します。'),
    record.milestones.length ? h('details', {}, h('summary', { 'data-focus-key': 'abyss-milestones' }, '節目の踏破記録'),
      ...[...record.milestones].reverse().map(clear => h('details', { class: 'abyss-milestone' },
        h('summary', { 'data-focus-key': `abyss-floor-${clear.floor}` }, `B${formatNumber(clear.floor)} 踏破時の編成`), recordedParty(clear, portrait)))) : null,
    h('p', { class: 'hint' }, '最新8件まで保存。配分と装備名は踏破時の記録です。現在の装備への復元操作ではありません。'))
}
