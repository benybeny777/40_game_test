import type { ItemView, JobId, ProfileView } from '../../core/index.ts'
import { attributeLabels } from '../../core/data/attributes.ts'
import { registerTranslations, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'
import './equipmentTraining.css'

registerTranslations({
  'この装備に向けて育成': 'Train for this equipment',
  '装備目標': 'Equipment goal',
  '不足': 'Missing',
  '比較へ戻る': 'Back to comparison',
  '目標を外す': 'Remove goal',
  'セーブを復元したため、装備目標と比較選択を解除しました。': 'Save restored. Equipment goals and comparison selections were cleared.',
  '装備したため、育成目標を終了しました。': 'Equipped successfully. The training goal is complete.',
  '持ち物からなくなったため、育成目標を終了しました。': 'The item is no longer in your inventory. The training goal has ended.',
  '別の出撃メンバーが装備したため、育成目標を終了しました。': 'Another deployed companion equipped this item. The training goal has ended.',
  '育成目標を外しました。配分や装備は変更していません。': 'Training goal removed. Attributes and equipment were not changed.',
  '装備条件を満たしました。比較画面で装備を選べます。': 'Requirements met. You can choose to equip it on the comparison screen.',
  'この装備は持ち物にありません。売却や整理後の持ち物を確認してください。': 'This item is no longer in your inventory. Check your equipment after selling or sorting.',
  '自動振りのまま育てるか、OFFにして手動で配分できます。振り直しは自分で選ぶまで行いません。': 'Keep auto allocation to train, or turn it off to allocate manually. Reallocation only happens when you choose it.',
})
export type EquipmentTrainingTarget = { itemId: string; itemName: string; job: JobId; slot: ItemView['slot'] }
export const equipmentTrainingTarget = (item: ItemView, job: JobId): EquipmentTrainingTarget => ({ itemId: item.id, itemName: item.name, job, slot: item.slot })
export function equipmentTrainingItem(view: ProfileView, target: EquipmentTrainingTarget) {
  return [...view.inventory, ...view.reserveEquipment, ...view.party.flatMap(member => Object.values(member.equip).filter((item): item is ItemView => item !== null))]
    .find(item => item.id === target.itemId)
}
export function equipmentTrainingEnd(view: ProfileView, target: EquipmentTrainingTarget): string | undefined {
  const item = equipmentTrainingItem(view, target)
  if (!item) return `${tr(target.itemName)}: ${tr('持ち物からなくなったため、育成目標を終了しました。')}`
  if (item.owner === target.job) return `${tr(item.name)}: ${tr('装備したため、育成目標を終了しました。')}`
  const owner = item.owner ? view.party.find(member => member.job === item.owner) : undefined
  if (owner?.active) return `${tr(item.name)} / ${tr(owner.name)}: ${tr('別の出撃メンバーが装備したため、育成目標を終了しました。')}`
}
export function renderEquipmentTraining(view: ProfileView, target: EquipmentTrainingTarget, back: () => void, remove: () => void) {
  const item = equipmentTrainingItem(view, target), check = item?.equipable[target.job]
  return h('section', { class: 'equipment-training' }, h('strong', {}, '装備目標'), h('p', {}, item?.name ?? target.itemName),
    !item ? h('p', {}, 'この装備は持ち物にありません。売却や整理後の持ち物を確認してください。')
      : check?.ok ? h('p', {}, '装備条件を満たしました。比較画面で装備を選べます。')
        : h('div', {}, h('p', {}, check?.reason), ...((check && !check.ok ? check.missing : undefined) ?? []).map(entry => h('p', {},
          attributeLabels[entry.key], ` ${entry.current} / ${entry.required} · `, '不足', ` ${entry.required - entry.current}`))),
    h('p', { class: 'hint' }, '自動振りのまま育てるか、OFFにして手動で配分できます。振り直しは自分で選ぶまで行いません。'),
    h('button', { type: 'button', 'data-focus-key': 'training-back-comparison', onclick: back }, '比較へ戻る'),
    h('button', { type: 'button', 'data-focus-key': 'training-remove-goal', onclick: remove }, '目標を外す'))
}
/** Open containing reserve disclosures too, then focus the actual allocation controls. */
export function focusEquipmentTraining(root: HTMLElement, job: JobId) {
  const card = root.querySelector<HTMLElement>(`[data-job="${job}"]`)
  if (!card) return false
  for (let parent = card.parentElement; parent && parent !== root; parent = parent.parentElement) if (parent.tagName === 'DETAILS') (parent as HTMLDetailsElement).open = true
  const details = card.querySelector<HTMLDetailsElement>('details')
  if (details) details.open = true
  const panel = card.querySelector<HTMLElement>('.attribute-panel')
  panel?.scrollIntoView({ block: 'start' })
  card.querySelector<HTMLElement>('.training-needed button:not(:disabled), .attribute-panel input')?.focus({ preventScroll: true })
  return true
}
