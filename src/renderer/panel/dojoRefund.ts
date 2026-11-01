import type { DojoRefund } from '../../core/progress/dojoRefund.ts'
import { getLocale, registerTranslations, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'

registerTranslations({
  '攻撃・HPの道場強化は終了しました。装備とステータスで強化できます。': 'Attack and HP dojo upgrades have been retired. Improve equipment and attributes instead.',
  '道場は移動・装備探索・放置報酬を支えます。': 'The dojo supports travel, equipment hunting and offline rewards.',
  '旧強化の返金': 'Retired upgrade refund',
  '購入済みの攻撃・HP強化を終了し、購入時の小判を返金します。': 'Purchased Attack and HP upgrades were retired. Their original costs are refundable.',
  '返金額': 'Refund',
  '素振り': 'Attack training',
  '走り込み': 'HP training',
  '返金済み': 'Credited',
  '返金残額': 'Refund remaining',
  '返金を受け取る': 'Claim refund',
  '所持上限で受け取れない分は保管しています。小判を使った後に残額を受け取れます。': 'Amounts above your wallet capacity are retained. Spend coins to make room, then claim the remainder.',
  '返金残額がないか、所持小判に空きがありません。': 'No refund remains, or your coin wallet has no room.',
  '同じ購入分を二重に返金しません。装備・レベル・ステ振り・到達階層は維持しています。': 'The same purchase is never refunded twice. Equipment, levels, allocated attributes and reached floors were preserved.',
})
export function renderDojoRefund(record: DojoRefund, koban: number, claim: () => void) {
  if (record.totalAmount === '0') return null
  const amount = (value: string) => new Intl.NumberFormat(getLocale() === 'ja' ? 'ja-JP' : 'en-US').format(BigInt(value))
  return h('details', { class: 'dojo-refund' },
    h('summary', { 'data-focus-key': 'dojo-refund' }, `${tr('旧強化の返金')}: ${amount(record.totalAmount)}`),
    h('p', {}, '購入済みの攻撃・HP強化を終了し、購入時の小判を返金します。'),
    h('p', {}, `${tr('素振り')}: ${record.atkLevels} / ${tr('走り込み')}: ${record.hpLevels}`),
    h('p', {}, `${tr('返金済み')}: ${amount(record.creditedAmount)} / ${tr('返金残額')}: ${amount(record.pendingAmount)}`),
    record.pendingAmount !== '0' ? h('div', {}, h('p', {}, '所持上限で受け取れない分は保管しています。小判を使った後に残額を受け取れます。'),
      h('button', { 'data-focus-key': 'dojo-refund-claim', disabled: koban >= Number.MAX_SAFE_INTEGER, onclick: claim }, '返金を受け取る')) : null,
    h('p', {}, '同じ購入分を二重に返金しません。装備・レベル・ステ振り・到達階層は維持しています。'))
}
