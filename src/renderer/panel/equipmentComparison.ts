import type { ItemView, JobId } from '../../core/index.ts'
import type { Stats } from '../../core/sim/types.ts'
import { formatNumber, registerTranslations } from '../../shared/i18n'
import { h } from './dom'
import { realTickSeconds } from '../../core/sim/time'

registerTranslations({
  '評価が上がる装備 → 刻印の選択肢 → その他の順。通常の改善品は評価差の大きい順です。': 'Order: higher-score equipment, engraving choices, then other items. Ordinary upgrades are ordered by estimated score gain.',
  '技能特性が変わる': 'Skill properties change',
  '刻印なし': 'No engraving',
  '刻印は威力や持続と待ち時間の交換です。総合点では順位を付けません。': 'Engravings trade power or duration for cooldown. They are not ranked by a combined score.',
  '装備後の変化': 'Changes when equipped',
  '能力の変化なし': 'No stat changes',
  '会心倍率': 'Critical multiplier',
  '被ダメージ倍率': 'Incoming damage multiplier',
  '小判倍率': 'Koban multiplier',
  '発見倍率': 'Loot multiplier',
  'スキル威力倍率': 'Skill ATK scaling',
  'スキル持続倍率': 'Skill effect duration',
  'スキル待ち時間倍率': 'Skill cooldown multiplier',
  '育成・スキルを開く': 'Training and skills',
  '評価差（目安）': 'Estimated score change',
  '新着を確認済みにする': 'Mark new finds as reviewed',
  '控えの装備を見る': 'View reserve equipment',
  '比べている装備': 'Selected comparison',
  '自動整理・まとめ売り': 'Auto sorting and bulk selling',
  '控えで装備中・装着すると付け替えます': 'Worn by a reserve; equipping transfers this item',
})

const fields: Array<{ key: keyof Stats; label: string; scale: number; unit: string; lower?: boolean }> = [
  { key: 'maxHp', label: 'HP', scale: 1, unit: '' },
  { key: 'atk', label: '攻撃', scale: 1, unit: '' },
  { key: 'def', label: '防御', scale: 1, unit: '' },
  { key: 'intervalMs', label: '間隔', scale: 1, unit: 's', lower: true },
  { key: 'cri', label: '会心', scale: 100, unit: '%' },
  { key: 'criMul', label: '会心倍率', scale: 1, unit: '×' },
  { key: 'eva', label: '回避', scale: 100, unit: '%' },
  { key: 'luk', label: '運', scale: 1, unit: '' },
  { key: 'dmgTakenMul', label: '被ダメージ倍率', scale: 1, unit: '×', lower: true },
  { key: 'skillPowerMul', label: 'スキル威力倍率', scale: 1, unit: '×' },
  { key: 'skillDurationMul', label: 'スキル持続倍率', scale: 1, unit: '×' },
  { key: 'cooldownMul', label: 'スキル待ち時間倍率', scale: 1, unit: '×', lower: true },
  { key: 'kobanMul', label: '小判倍率', scale: 1, unit: '×' },
  { key: 'dropMul', label: '発見倍率', scale: 1, unit: '×' },
]

export function equipmentChanges(item: ItemView, job: JobId) {
  const comparison = item.comparison[job]
  if (!comparison) return []
  return fields.flatMap(field => {
    const values = comparison[field.key]
    if (!values) return []
    const display = (value: number) => field.key === 'intervalMs' ? realTickSeconds(value) : value * field.scale
    const before = display(values.before), after = display(values.after)
    if (before === after) return []
    return [{ ...field, before, after, improved: field.lower ? after < before : after > before }]
  })
}

export function renderEquipmentComparison(item: ItemView, job: JobId) {
  if (!item.equipable[job].ok) return null
  const changes = equipmentChanges(item, job)
  return h('section', { class: 'equipment-comparison', 'aria-label': '装備後の変化' },
    h('small', {}, '装備後の変化'), renderSkillTradeoff(item, job),
    changes.length ? h('dl', {}, ...changes.map(change => h('div', { class: change.improved ? 'improved' : 'reduced' },
      h('dt', {}, change.label),
      h('dd', {}, `${formatStat(change.before, change.unit)} → ${formatStat(change.after, change.unit)} ${change.improved ? '↑' : '↓'}`))))
      : h('p', {}, '能力の変化なし'))
}

function formatStat(value: number, unit: string) {
  return formatNumber(value, { maximumFractionDigits: unit === '×' ? 3 : unit === 's' ? 2 : 1 }) + unit
}

/** Removing an engraving alone is not a new-find opportunity, even though its cooldown improves. */
export function isWeakEngravingRemoval(item: ItemView, job: JobId): boolean {
  const change = item.skillTradeoff[job]
  return Boolean(change?.before && !change.after && !equipmentChanges(item, job).some(stat =>
    stat.improved && !['cooldownMul', 'skillPowerMul', 'skillDurationMul'].includes(stat.key)))
}
/** 3: measured improvement; 2: skill choice; 1: other usable item; 0: unmet requirements. */
export function equipmentReviewPriority(item: ItemView, job: JobId): number {
  if (!item.equipable[job].ok) return 0
  if ((item.delta[job] ?? 0) > 0) return 3
  if (item.skillTradeoff[job] && !isWeakEngravingRemoval(item, job)) return 2
  return 1
}
export function compareEquipmentReviews(a: ItemView, aJob: JobId, b: ItemView, bJob: JobId): number {
  const priorityA = equipmentReviewPriority(a, aJob), priorityB = equipmentReviewPriority(b, bJob)
  return priorityB - priorityA
    || (priorityA === 3 ? (b.delta[bJob] ?? 0) - (a.delta[aJob] ?? 0) : 0)
    || b.rarity - a.rarity
}
export const compareEquipmentChoices = (a: ItemView, b: ItemView, job: JobId) => compareEquipmentReviews(a, job, b, job)
export function renderSkillTradeoff(item: ItemView, job: JobId) {
  const change = item.skillTradeoff[job]
  if (!change) return null
  return h('div', { class: 'skill-tradeoff' }, h('strong', {}, '技能特性が変わる'),
    h('p', {}, '刻印は威力や持続と待ち時間の交換です。総合点では順位を付けません。'),
    h('p', {}, h('small', {}, '今の装備'), h('span', {}, change.before ?? '刻印なし')),
    h('p', {}, h('small', {}, '新しい装備'), h('span', {}, change.after ?? '刻印なし')))
}
