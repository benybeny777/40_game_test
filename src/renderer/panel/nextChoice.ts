import type { ItemView, JobId, ProfileView } from '../../core/index.ts'
import { registerTranslations, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'

registerTranslations({
  '拾った装備を比べよう': 'Compare your new find',
  '今の装備': 'Currently equipped',
  '新しい装備': 'New equipment',
  '比べて選ぶ': 'Compare and choose',
  '装備条件を見る': 'Check requirements',
  '今は装備できません。育成や振り直し、別の仲間への装備を検討できます。': 'Not equipable yet. Consider training, reallocating attributes, or another companion.',
  '装備なし': 'Empty slot',
  '数値だけでなく、追加効果と必要能力も比べましょう。': 'Compare effects and attribute requirements as well as raw power.',
  '最初の探索': 'Your first expedition',
  '1階を突破すると、出撃中の仲間向けの武器が手に入ります。': 'Clear floor 1 to find a weapon for one of your deployed companions.',
  '拾う → 比べる → 装備する。自分の3人を強くして、次の階へ。': 'Find, compare, equip. Strengthen your trio and head deeper.',
})

/** Pure recommendation: no automatic equip, no progression mutation, no fabricated improvement claim. */
export function nextLootChoice(view: ProfileView) {
  const members = view.party.filter(member => member.active)
  const choices = view.inventory.filter(item => item.isNew).flatMap(item => {
    const usable = members.filter(member => item.equipable[member.job].ok && ((item.delta[member.job] ?? 0) > 0 || item.rarity >= 3))
    const recipients = usable.length || item.rarity < 3 ? usable
      : [view.party.find(member => member.job === item.job) ?? members[0]]
    return recipients.map(member => ({ item, member, delta: item.delta[member.job] ?? 0 }))
  })
  return choices.sort((a, b) => b.item.rarity - a.item.rarity || b.delta - a.delta)[0]
}

export function renderNextChoice(view: ProfileView, compare: (job: JobId, item: ItemView) => void) {
  const choice = nextLootChoice(view)
  if (choice) {
    const { item, member } = choice, worn = member.equip[item.slot]
    const eligibility = item.equipable[member.job]
    return h('aside', { class: 'next-choice', 'aria-label': tr('拾った装備を比べよう') },
      h('div', {}, h('span', { class: 'eyebrow' }, '拾った装備を比べよう'),
        h('h3', {}, `${tr(member.name)} · ${tr(item.slotName)}`),
        h('div', { class: 'loot-comparison' },
          h('div', {}, h('small', {}, '今の装備'), h('strong', {}, worn?.name ?? '装備なし')),
          h('div', { style: `--rarity:${item.color}` }, h('small', {}, '新しい装備'), h('strong', {}, item.name), h('span', {}, item.rarityName))),
        h('p', {}, eligibility.ok ? '数値だけでなく、追加効果と必要能力も比べましょう。' : '今は装備できません。育成や振り直し、別の仲間への装備を検討できます。'),
        eligibility.ok ? null : h('p', {}, eligibility.reason)),
      h('button', { class: 'primary', 'data-focus-key': 'next-loot', onclick: () => compare(member.job, item) }, eligibility.ok ? '比べて選ぶ' : '装備条件を見る'))
  }
  if (view.stats.stageClears === 0) return h('aside', { class: 'next-choice first-expedition' },
    h('div', {}, h('span', { class: 'eyebrow' }, '最初の探索'),
      h('h3', {}, '1階を突破すると、出撃中の仲間向けの武器が手に入ります。'),
      h('p', {}, '拾う → 比べる → 装備する。自分の3人を強くして、次の階へ。')))
  return null
}
