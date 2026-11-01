import type { MemberView } from '../../core/index.ts'
import { balance } from '../../core/data/balance.ts'
import { attributeBalance } from '../../core/data/attributes.ts'
import { formatNumber, registerTranslations, registerTranslationTemplates } from '../../shared/i18n'
import { h } from './dom'
import './memberGrowth.css'
import './translations'
import '../../shared/locales/system'

registerTranslations({
  '出撃中。レベルは上限に達しています。': 'Deployed. Level cap reached.',
  '出撃予約中。レベルは上限に達しています。': 'Queued for deployment. Level cap reached.',
  'レベル上限です。装備を探し、能力の配分を見直して強化できます。': 'Level cap reached. Find equipment and review your attribute allocation to grow stronger.',
  '経験値の進行': 'Experience progress',
})
registerTranslationTemplates([
  { ja: '次のレベルで配分ポイント +{n} pt', en: 'Next level: +{n} attribute points' },
])

type Growth = Pick<MemberView, 'lv' | 'exp' | 'expNext' | 'availablePoints' | 'active' | 'fighting' | 'experienceMultiplier'>
export function renderMemberLevel(member: Pick<Growth, 'lv'>) {
  return h('span', { class: 'lv' }, `Lv ${member.lv} / ${balance.maxLevel}${member.lv >= balance.maxLevel ? ' · MAX' : ''}`)
}
export function renderMemberGrowth(member: Growth) {
  const capped = member.lv >= balance.maxLevel
  const status = member.fighting ? capped ? '出撃中。レベルは上限に達しています。' : '戦闘参加で経験値'
    : member.active ? capped ? '出撃予約中。レベルは上限に達しています。' : '反映後の戦闘から経験値を獲得します'
      : '控えでは経験値を獲得しません'
  return h('div', { class: 'member-growth' },
    member.availablePoints > 0 ? h('small', { class: 'unspent-points' }, `未使用 ${member.availablePoints} pt`) : null,
    !capped && member.fighting && member.experienceMultiplier > 1 ? h('small', { class: 'unspent-points' }, `出撃中の育成支援：経験値 最大${member.experienceMultiplier}倍`) : null,
    !capped ? h('div', { class: 'exp', role: 'progressbar', 'aria-label': '経験値の進行', 'aria-valuemin': 0, 'aria-valuemax': member.expNext, 'aria-valuenow': member.exp },
      h('i', { style: `width:${Math.min(100, member.exp / member.expNext * 100)}%` })) : null,
    h('small', {}, status),
    capped ? h('small', { class: 'growth-cap' }, 'レベル上限です。装備を探し、能力の配分を見直して強化できます。')
      : h('div', {}, h('small', {}, `次のLvまで ${formatNumber(member.expNext - member.exp)}`),
        h('small', { class: 'growth-reward' }, `次のレベルで配分ポイント +${attributeBalance.pointsPerLevel} pt`)))
}
