import type { ItemView, JobId } from '../../core/index.ts'
import type { Stats } from '../../core/sim/types.ts'
import { formatNumber, registerTranslations } from '../../shared/i18n'
import { h } from './dom'

registerTranslations({
  '装備後の変化': 'Changes when equipped',
  '能力の変化なし': 'No stat changes',
  '会心倍率': 'Critical multiplier',
  '被ダメージ倍率': 'Incoming damage multiplier',
  '小判倍率': 'Koban multiplier',
  '発見倍率': 'Loot multiplier',
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
  { key: 'intervalMs', label: '間隔', scale: .001, unit: 's', lower: true },
  { key: 'cri', label: '会心', scale: 100, unit: '%' },
  { key: 'criMul', label: '会心倍率', scale: 1, unit: '×' },
  { key: 'eva', label: '回避', scale: 100, unit: '%' },
  { key: 'luk', label: '運', scale: 1, unit: '' },
  { key: 'dmgTakenMul', label: '被ダメージ倍率', scale: 1, unit: '×', lower: true },
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
    const before = values.before * field.scale, after = values.after * field.scale
    return [{ ...field, before, after, improved: field.lower ? after < before : after > before }]
  })
}

export function renderEquipmentComparison(item: ItemView, job: JobId) {
  if (!item.equipable[job].ok) return null
  const changes = equipmentChanges(item, job)
  return h('section', { class: 'equipment-comparison', 'aria-label': '装備後の変化' },
    h('small', {}, '装備後の変化'),
    changes.length ? h('dl', {}, ...changes.map(change => h('div', { class: change.improved ? 'improved' : 'reduced' },
      h('dt', {}, change.label),
      h('dd', {}, `${formatStat(change.before, change.unit)} → ${formatStat(change.after, change.unit)} ${change.improved ? '↑' : '↓'}`))))
      : h('p', {}, '能力の変化なし'))
}

function formatStat(value: number, unit: string) {
  return formatNumber(value, { maximumFractionDigits: unit === '×' ? 3 : unit === 's' ? 2 : 1 }) + unit
}
