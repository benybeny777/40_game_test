import { loadUiFonts } from '../fonts'
import { runtimeFailure } from '../runtimeFailure'
import { brand } from '../../shared/brand'
import { roleLabels, type JobRole, type ItemView, type JobId, type MemberView, type ProfileView, type SlotId } from '../../core/index.ts'
import type { PanelTab, ShellState } from '../../shared/api'
import { attributeKeys, attributeLabels } from '../../core/data/attributes.ts'
import { renderDungeon } from './dungeon'
import { DungeonTravelDraft } from './dungeonTravel'
import { renderDefeatReview } from './defeatReview'
import { renderDojoRefund } from './dojoRefund'
import type { StoreView } from '../../shared/commerce'
import { renderStore } from './store'
import { renderHelp } from './help'
import { renderDex } from './dex'
import { initializePlatform } from '../platform'
import { formatNumber, getLocale, onLocaleChange, setLocale, t, translatedLabel } from '../../shared/i18n'
import './translations'
import '../../shared/locales/system'
import { h } from './dom'
import { portraitsReady, spriteImage } from './portrait'
import { assignFocusKeys, capturePanelPosition, restorePanelPosition, PanelPositions } from './focus'
import { PanelModalFocus } from './modalFocus'
import { pointerRenderGuard } from './pointerRenderGuard'
import { SaveImportController, renderSaveImport, renderSaveImportDialog } from './saveImport'
import { renderCloudSettings } from './cloud'
import { renderNextChoice } from './nextChoice'
import { compareEquipmentChoices, renderEquipmentComparison } from './equipmentComparison'
import { reportRendererError } from '../errors'
import { previewReplacement } from '../../core/progress/formationSupport.ts'
import { renderFormationSupport } from './formationSupport'
import { renderNextBoss } from './nextBoss'
import { renderMemberLevel, renderMemberGrowth } from './memberGrowth'
import { renderCharacterPicker } from './characterPicker'
import { equipmentTrainingTarget, equipmentTrainingItem, equipmentTrainingEnd, renderEquipmentTraining, focusEquipmentTraining, type EquipmentTrainingTarget } from './equipmentTraining'

const runtime = runtimeFailure(initializePlatform())

const fmt = (value: number) => formatNumber(Math.floor(value))

const tabs: Array<{ id: PanelTab; name: string }> = [
  { id: 'party', name: 'パーティ' }, { id: 'gear', name: '装備' }, { id: 'dojo', name: '道場' }, { id: 'stage', name: 'ダンジョン' }, { id: 'dex', name: '図鑑' }, { id: 'store', name: 'ストア' }, { id: 'help', name: 'あそびかた' }, { id: 'settings', name: '設定' },
]
let tab: PanelTab = 'party'
let focusJob: JobId | undefined
let trainingTarget: EquipmentTrainingTarget | undefined
let trainingFocus = false
let trainingNotice: string | undefined
let profileReplacementPending = false
let view: ProfileView | undefined
let state: ShellState | undefined
let viewEvents = 0, stateEvents = 0
let storeView: StoreView | undefined
let applyingNativeLocale = false
function syncNativeLocale() {
  if (!state || !state.settings.locale) return
  applyingNativeLocale = true
  try { setLocale(state.settings.locale) } finally { applyingNativeLocale = false }
}
let commandPending = false
const pointerGuard = pointerRenderGuard(window, () => render())
let rendering = false
let artworkReady = false
let toast = ''
let toastTimer: ReturnType<typeof setTimeout> | undefined

const root = document.querySelector<HTMLElement>('#app')!
async function command(...args: Parameters<typeof window.game.command>) {
  if (commandPending) return
  commandPending = true
  try {
    const result = await window.game.command(...args)
    if (!result.ok) showToast(result.reason)
    if (args[0].c === 'selectStage') dungeonTravelDraft.completed(result)
    view = await window.game.getView()
    return result
  } catch (error) { showToast(reportRendererError('操作を完了できませんでした。少し待って再度お試しください。', error)) }
  finally { commandPending = false; render(true) }
}
function setToast(text: string) {
  toast = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast = ''; render() }, 2400)
}
function showToast(text: string) { setToast(text); render() }
function finishTraining(message: string) { trainingTarget = undefined; trainingFocus = false; trainingNotice = message }

let swapPicker: JobId | undefined
let pendingChoiceFocus: string | undefined
let pendingGearFocus = false
let swapDraft: { from: JobId; to: JobId } | undefined
function swapPreview(member: MemberView) {
  if (!swapDraft || swapDraft.from !== member.job || !view) return null
  const target = view.party.find(candidate => candidate.job === swapDraft!.to)
  if (!target || target.active === member.active) return null
  const next = previewReplacement(view.party, member.job, target.job)
  return h('div', { class: 'swap-preview' },
    h('div', { class: 'swap-portraits' },
      h('div', {}, spriteImage(member.job, 2), h('b', {}, member.name)), h('span', { 'aria-hidden': 'true' }, '⇄'),
      h('div', {}, spriteImage(target.job, 2), h('b', {}, target.name))),
    renderFormationSupport(next.members, true, view.party.filter(candidate => candidate.active)),
    h('p', { class: 'hint' }, '次のウェーブから反映されます。'),
    h('div', { class: 'swap-preview-actions' },
      h('button', { disabled: commandPending, 'data-focus-key': `confirm-swap-${member.job}`, onclick: async () => {
        const result = await command({ c: 'reorderParty', order: next.order })
        if (result?.ok) { swapDraft = undefined; pendingChoiceFocus = `recruit-${member.active ? target.job : member.job}`; render(true) }
      } }, '交換を確定'),
      h('button', { disabled: commandPending, onclick: () => { swapDraft = undefined; pendingChoiceFocus = `recruit-${member.job}`; render(true) } }, '交換を取り消す')))
}
function memberCard(member: MemberView, index: number, order: JobId[]) {
  const size = view!.partySize
  const move = (delta: number) => {
    const next = [...order], target = index + delta
    if (target < 0 || target >= size) return
    ;[next[index], next[target]] = [next[target], next[index]]
    void command({ c: 'reorderParty', order: next })
  }
  const s = member.stats
  const trainingCheck = trainingTarget?.job === member.job ? equipmentTrainingItem(view!, trainingTarget)?.equipable[member.job] : undefined
  const missingAttributes = trainingCheck && !trainingCheck.ok ? trainingCheck.missing?.map(entry => entry.key) : undefined
  return h('article', { class: `card${focusJob === member.job ? ' focus' : ''}`, 'data-job': member.job, 'data-focus-scope': `member-${member.job}`, style: `--job:${member.color}` },
    h('div', { class: 'card-head' },
      spriteImage(member.job, 2),
      h('div', {},
        h('div', { class: 'slot' }, member.active && !member.fighting ? '出撃予約・次のウェーブから' : !member.active && member.fighting ? '交代待ち・現在の出撃メンバー' : member.active ? index === 0 ? '出撃・前衛（先頭）' : `出撃・${index + 1}番手` : '控え・経験値なし（育成と装備を保持）'),
        h('h3', {}, member.name, renderMemberLevel(member)),
        h('span', { class: `role-badge role-${member.roleId}` }, member.role),
        renderMemberGrowth(member))),
    h('details', { class: 'member-details' },
    h('summary', { 'data-focus-key': `training-${member.job}` }, member.active ? '育成・スキルを開く' : '能力・スキルを見る'),
    h('dl', { class: 'stats' },
      ...([['HP', fmt(s.hp)], ['攻撃', s.atk], ['防御', s.def], ['間隔', `${s.interval}秒`], ['会心', `${s.cri}%`], ['回避', `${s.eva}%`], ['運', s.luk], ['射程', s.range]] as const)
        .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(v))))),
    h('ul', { class: 'skills' }, ...member.skills.map((skill) => h('li', { class: skill.unlocked ? '' : 'locked' },
      h('span', { class: 'kind' }, skill.kind), h('b', {}, skill.name), h('p', {}, skill.unlocked ? skill.desc : `Lv${skill.unlockLv}で解放`)))),
    h('section', { class: 'attribute-panel' },
      trainingTarget?.job === member.job ? renderEquipmentTraining(view!, trainingTarget, () => {
        if (!trainingTarget) return
        const ended = equipmentTrainingEnd(view!, trainingTarget)
        if (ended) { finishTraining(ended); render(); return }
        gearJob = trainingTarget!.job; gearFilter = trainingTarget!.slot; compareItem = trainingTarget!.itemId; tab = 'gear'; render()
      }, () => { finishTraining('育成目標を外しました。配分や装備は変更していません。'); render() }) : null,
      h('h4', {}, 'ステータス配分', h('span', {}, `未使用 ${member.availablePoints} pt`)),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: member.autoStats, onchange: (event: Event) => void command({ c: 'setAutoStats', job: member.job, enabled: (event.target as HTMLInputElement).checked }) }), '自動振り'),
      h('p', { class: 'hint' }, `主属性：${attributeLabels[member.mainAttribute]}。自動配分 ${attributeKeys.map(key => `${attributeLabels[key]}${member.autoWeights[key]}`).join(' / ')}。手動にするには自動振りをOFFにします。`),
      ...attributeKeys.map(key => h('div', { class: `attribute-row${missingAttributes?.includes(key) ? ' training-needed' : ''}` },
        h('label', {}, `${translatedLabel(attributeLabels[key])} ${member.attributes[key]}`, h('small', {}, `基礎${member.baseAttributes[key]}＋配分${member.allocated[key]}`)),
        h('button', { 'data-focus-key': `allocate-${member.job}-${key}-one`, 'aria-label': `${translatedLabel(member.name)}: ${translatedLabel(attributeLabels[key])} — ${translatedLabel('1ポイント追加')}`, disabled: member.autoStats || member.availablePoints < 1, onclick: () => void command({ c: 'allocateStats', job: member.job, key, points: 1 }) }, '+1'),
        h('button', { 'data-focus-key': `allocate-${member.job}-${key}-all`, 'aria-label': `${translatedLabel(member.name)}: ${translatedLabel(attributeLabels[key])} — ${translatedLabel('残りのポイントを全て追加')}`, disabled: member.autoStats || member.availablePoints < 1, title: `未使用ポイントを全て${attributeLabels[key]}へ`, onclick: () => void command({ c: 'allocateStats', job: member.job, key, points: member.availablePoints }) }, '全振り'))),
      h('button', { class: 'reset-stats', disabled: !member.autoStats && attributeKeys.every(key => member.allocated[key] === 0), onclick: () => void command({ c: 'resetStats', job: member.job }) }, '無料で振り直す'),
      h('small', { class: 'hint' }, '振り直すと全ポイントを回収し、自動振りをOFFにします。条件を満たさなくなった装備は持ち物に戻ります。'))),
    member.active ? h('div', { class: 'order' },
      h('button', { onclick: () => move(-1), disabled: index === 0, title: '前へ' }, '◀ 前へ'),
      h('button', { onclick: () => move(1), disabled: index === size - 1, title: '後ろへ' }, '後ろへ ▶')) : null,
    h('button', { class: 'recruit-open', 'data-focus-key': `recruit-${member.job}`, 'aria-expanded': String(swapPicker === member.job), onclick: () => {
      swapPicker = swapPicker === member.job ? undefined : member.job; swapDraft = undefined; render(true)
    } }, swapPicker === member.job ? '仲間一覧を閉じる' : member.active ? '仲間を交代' : 'この仲間を出撃させる'),
    swapPicker === member.job ? h('section', { class: 'recruit-panel' },
      h('h4', {}, member.active ? '代わりに出撃する仲間' : '交代する出撃メンバー'),
      renderCharacterPicker(view!.party.filter(candidate => candidate.active !== member.active), swapDraft?.to ?? null, selected => {
        swapDraft = { from: member.job, to: selected }; swapPicker = undefined
        pendingChoiceFocus = `confirm-swap-${member.job}`; render(true)
      }, `swap-${member.job}`)) : null,
    swapPreview(member))
}

let reserveRole: JobRole | 'all' = 'all'
function partyTab(v: ProfileView) {
  const order = v.party.map((member) => member.job)
  return h('section', {},
    renderDefeatReview(v.lastDefeat, {
      formation: () => { const roster = root.querySelector<HTMLElement>('.deployed-roster'); roster?.scrollIntoView({ block: 'start', behavior: 'smooth' }); roster?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }) },
      equipment: (job, slot) => { gearJob = job; gearFilter = slot; compareItem = undefined; tab = 'gear'; render() },
      retry: record => { tab = 'stage'; void command({ c: 'selectStage', stageNo: record.floor, depthRank: record.depthRank }) },
    }, v.lastDefeatResolved, v.dungeon),
    renderNextChoice(v, (job, item) => { gearJob = job; gearFilter = item.slot; compareItem = item.id; tab = 'gear'; render() }, itemId => { void command({ c: 'markItemSeen', itemId }) }),
    h('div', { class: 'journey' },
      h('div', {}, h('span', { class: 'eyebrow' }, '黄泉の迷宮へ、三人で潜る'), h('h2', {}, `出撃パーティ ${v.partySize}人`),
        h('p', {}, v.dungeon.town ? '街で休息中。編成・装備を整えて探索を再開しましょう。' : `${v.party.length}ジョブから3人を編成。${translatedLabel(v.stage.areaName)} ${translatedLabel(v.stage.label)} を冒険中。`)),
      h('button', { class: 'journey-link', onclick: () => { tab = 'gear'; render() } }, '装備を整える →')),
    h('div', { class: 'roster deployed-roster' }, ...v.party.filter(member => member.active).map((member) => h('button', { 'data-focus-key': `portrait-${member.job}`, style: `--job:${member.color}`, onclick: () => root.querySelector(`[data-job="${member.job}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) },
      spriteImage(member.job, 2), h('b', {}, member.name), h('small', {}, `Lv ${member.lv}`)))),
    h('p', { class: 'hint' }, '先頭が前衛です。経験値は実際に戦う出撃3人だけが獲得します。入れ替え・並び替えは次のウェーブから反映されます。控えは現在のレベルと装備を保持します。'),
    v.formationPending ? h('p', { class: 'hint', role: 'status' }, '編成の反映待ちです。現在の出撃メンバーが次のウェーブまで戦い、経験値を獲得します。') : null,
    renderNextBoss(v),
    renderFormationSupport(v.party.filter(member => member.fighting)),
    h('div', { class: 'cards deployed-cards' }, ...v.party.filter(member => member.active).map((member) => memberCard(member, order.indexOf(member.job), order))),
    h('details', { class: 'reserve-section' },
    h('summary', { class: 'reserve-title', 'data-focus-key': 'reserve-expand' }, `控え ${v.party.length - v.partySize}人`),
    h('p', { class: 'hint' }, '交代する相手を選ぶと、出撃メンバーと入れ替わります。控えの能力・スキル・運による効果は戦闘に加算されません。'),
    h('div', { class: 'filters role-filters' }, ...(['all', ...Object.keys(roleLabels)] as Array<JobRole | 'all'>).map(role => h('button', { 'data-focus-key': `reserve-role-${role}`, 'aria-pressed': String(reserveRole === role), class: reserveRole === role ? 'active' : '', onclick: () => { reserveRole = role; render() } }, role === 'all' ? 'すべて' : roleLabels[role]))),
    h('div', { class: 'cards reserve-cards' }, ...v.party.filter(member => !member.active && (reserveRole === 'all' || member.roleId === reserveRole)).map((member) => memberCard(member, order.indexOf(member.job), order)))))
}
let gearJob: JobId | undefined
let gearFilter: SlotId | 'all' = 'all'
let gearEquipableOnly = false
let compareItem: string | undefined
const slotNames: Record<SlotId, string> = { weapon: '武器', armor: '防具', charm: 'お守り' }
function itemCard(item: ItemView, job: JobId, worn: boolean) {
  const delta = item.delta[job] ?? 0, eligibility = item.equipable[job]
  const diff = !eligibility.ok ? h('span', { class: 'delta none' }, eligibility.reason)
    : worn ? h('span', { class: 'delta' }, '装備中')
    : item.skillTradeoff[job] ? h('span', { class: 'delta' }, '技能特性が変わる')
    : h('span', { title: '評価差（目安）', class: `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}` }, delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : '±0')
  return h('div', { class: `item${item.isNew ? ' new' : ''}${compareItem === item.id ? ' compare-target' : ''}`, 'data-focus-scope': `item-${item.id}`, style: `--rarity:${item.color}` },
    h('div', { class: 'item-head' },
      h('span', { class: 'rarity' }, item.rarityName), h('b', {}, item.name), h('small', {}, `${item.slotName}・装備ランク${item.ilvl}`), item.isNew ? h('em', {}, 'NEW') : null, diff),
    h('p', { class: 'lines' }, item.lines.map(translatedLabel).join(' / ')),
    !worn && item.owner ? h('p', { class: 'hint' }, `${translatedLabel(view!.party.find(member => member.job === item.owner)!.name)}：${translatedLabel('控えで装備中・装着すると付け替えます')}`) : null,
    worn ? null : renderEquipmentComparison(item, job, (item, job) => {
      trainingTarget = equipmentTrainingTarget(item, job); trainingFocus = true; focusJob = undefined; reserveRole = 'all'; tab = 'party'; render()
    }),
    h('div', { class: 'item-actions' },
      worn ? h('button', { onclick: () => void command({ c: 'equip', job, slot: item.slot, itemId: null }) }, '外す')
        : eligibility.ok ? h('button', { class: 'primary', onclick: () => void command({ c: 'equip', job, slot: item.slot, itemId: item.id }) }, '装備する') : null,
      h('button', { onclick: () => void command({ c: 'lock', itemId: item.id, locked: !item.locked }) }, item.locked ? '[ロック中]' : 'ロック'),
      worn || item.owner ? null : h('button', { disabled: item.locked, onclick: () => void command({ c: 'sell', itemIds: [item.id] }) }, `売る（${fmt(item.sellPrice)}）`)))
}
function gearTab(v: ProfileView) {
  const job = gearJob && v.party.some((member) => member.job === gearJob) ? gearJob : v.party[0].job
  const member = v.party.find((entry) => entry.job === job)!
  const available = [...v.inventory, ...v.reserveEquipment.filter(item => item.owner !== job)]
  const highlighted = available.find(item => item.id === compareItem)
  const list = available.filter((item) => (gearFilter === 'all' || item.slot === gearFilter) && (!gearEquipableOnly || item.equipable[job].ok))
    .sort((a, z) => Number(z.id === compareItem) - Number(a.id === compareItem) || compareEquipmentChoices(a, z, job))
  const sellOptions = [null, 0, 1, 2] as const
  const owned = v.inventoryCount
  const sellableCount = v.inventory.filter(item => item.rarity === 0 && !item.locked).length
  return h('section', { class: 'gear' },
    h('details', { class: 'gear-management' }, h('summary', { 'data-focus-key': 'gear-management' }, '自動整理・まとめ売り'), h('div', { class: 'gear-options' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: v.options.autoEquip, onchange: (event: Event) => void command({ c: 'setOptions', autoEquip: (event.target as HTMLInputElement).checked }) }), h('span', {}, '能力が下がらない装備を出撃者へ自動装備')),
      h('div', { class: 'auto-sell-choices', role: 'group', 'aria-label': '拾ったら自動で売る：' }, h('span', {}, '拾ったら自動で売る：'),
        ...sellOptions.map(rarity => h('button', { 'aria-pressed': String(v.options.autoSellMaxRarity === rarity),
          class: v.options.autoSellMaxRarity === rarity ? 'active' : '', 'data-focus-key': `auto-sell-${rarity ?? 'off'}`,
          onclick: () => void command({ c: 'setOptions', autoSellMaxRarity: rarity }) }, rarity === null ? '売らない' : `${v.rarityNames[rarity]}以下`))),
      h('button', { disabled: sellableCount === 0, onclick: () => void command({ c: 'sellAll', maxRarity: 0 }) }, `${v.rarityNames[0]}をまとめて売る（${sellableCount}個）`),
      h('button', { disabled: !v.inventory.some(item => item.isNew), onclick: () => void command({ c: 'markSeen' }) }, '新着を確認済みにする'),
      h('span', { class: 'count' }, `所持 ${owned} / ${v.inventoryMax}`)),
    h('p', { class: 'hint' }, '固有・ロック装備は自動で変更しません。追加効果や能力の交換条件がある装備は、自分で比較して選びます。')),
    h('div', { class: 'jobs' }, ...v.party.filter(entry => entry.active).map((entry) => h('button', { 'data-focus-key': `gear-job-${entry.job}`, class: entry.job === job ? 'active' : '', style: `--job:${entry.color}`, onclick: () => { gearJob = entry.job; render() } },
      spriteImage(entry.job, 1), h('span', {}, entry.name), h('small', {}, `Lv${entry.lv}`)))),
    h('details', { class: 'reserve-picker' },
      h('summary', { 'data-focus-key': 'reserve-gear' }, '待機中の仲間の装備', !member.active ? h('b', { class: 'reserve-selected' }, member.name) : null),
      renderCharacterPicker(v.party.filter(entry => !entry.active), job, selected => { gearJob = selected; compareItem = undefined; pendingGearFocus = true; render(true) }, 'gear-reserve')),
    highlighted ? h('section', { class: 'selected-comparison' }, h('h3', {}, '比べている装備'),
      h('p', { class: 'hint' }, `${translatedLabel(member.name)} · ${translatedLabel(member.equip[highlighted.slot]?.name ?? '装備なし')} → ${translatedLabel(highlighted.name)}`),
      itemCard(highlighted, job, false)) : null,
    h('div', { class: 'gear-body' },
      h('div', { class: 'worn' },
        h('h3', { tabindex: '-1', 'data-focus-key': 'gear-heading' }, `${member.name}の装備`),
        h('dl', { class: 'stats' }, ...([['HP', fmt(member.stats.hp)], ['攻撃', member.stats.atk], ['防御', member.stats.def], ['間隔', `${member.stats.interval}秒`], ['会心', `${member.stats.cri}%`], ['回避', `${member.stats.eva}%`], ['運', member.stats.luk]] as const)
          .map(([k, value]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(value))))),
        ...(Object.keys(slotNames) as SlotId[]).map((slot) => member.equip[slot] ? itemCard(member.equip[slot]!, job, true)
          : h('div', { class: 'item empty' }, h('span', {}, slotNames[slot]), h('p', {}, 'なし')))),
      h('div', { class: 'bag' },
        h('p', { class: 'hint' }, '評価が上がる装備 → 刻印の選択肢 → その他の順。通常の改善品は評価差の大きい順です。'),
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', 'data-focus-key': 'gear-equipable-only', checked: gearEquipableOnly, onchange: (event: Event) => { gearEquipableOnly = (event.target as HTMLInputElement).checked; render() } }), '選択中のキャラが装備できるものだけ'),
        h('div', { class: 'filters' }, ...(['all', 'weapon', 'armor', 'charm'] as const).map((key) => h('button', { 'data-focus-key': `gear-filter-${key}`, 'aria-pressed': String(gearFilter === key), class: gearFilter === key ? 'active' : '', onclick: () => { gearFilter = key; render() } }, key === 'all' ? 'すべて' : slotNames[key]))),
        list.length ? h('div', { class: 'items' }, ...list.filter(item => item.id !== highlighted?.id).map((item) => itemCard(item, job, false))) : h('p', { class: 'hint' }, v.inventory.length ? 'この条件に合う装備はありません。種類や装備条件の絞り込みを変更してください。' : '持ち物はありません。敵を倒すとたまに装備を落とします（ボスは必ず）。'))))
}
function dojoTab(v: ProfileView) {
  return h('section', {},
    h('p', { class: 'hint' }, '道場は移動・装備探索・放置報酬を支えます。'),
    renderDojoRefund(v.dojoRefund, v.koban, () => void command({ c: 'claimDojoRefund' })),
    h('div', { class: 'rows' }, ...v.dojo.map((entry) => h('div', { class: 'row' },
      h('div', {}, h('b', {}, entry.name), h('span', { class: 'lv' }, `段階 ${entry.level}${entry.max === null ? '' : ` / ${entry.max}`}`), h('p', {}, entry.desc)),
      h('button', { 'data-focus-key': `dojo-${entry.key}`, class: 'buy', disabled: !entry.affordable, onclick: () => void command({ c: 'buyDojo', key: entry.key }) },
        entry.max !== null && entry.level >= entry.max ? '最大' : `小判 ${fmt(entry.cost)}`)))))
}
function settingsTab() {
  const settings = state?.settings
  if (!settings) return h('section', {})
  const update = async (next: Parameters<typeof window.game.updateSettings>[0]) => {
    const previous = state
    try { state = await window.game.updateSettings(next) }
    catch (error) {
      state = previous
      console.error('Settings update failed', error)
      try { state = await window.game.getState() } catch (readError) { console.error('Settings state could not be verified after failed update', new AggregateError([error, readError])) }
      showToast(reportRendererError('設定を保存できませんでした。現在の設定を確認してください。', error))
    } finally { render(true) }
  }
  return h('section', { class: 'settings' },
    h('label', {}, h('span', {}, t('language')), h('select', { 'aria-label': t('language'), onchange: (event: Event) => setLocale((event.target as HTMLSelectElement).value as 'ja' | 'en') },
      h('option', { value: 'ja', selected: getLocale() === 'ja' }, '日本語'), h('option', { value: 'en', selected: getLocale() === 'en' }, 'English'))),
    state?.platform !== 'browser' ? h('label', {}, h('span', {}, '表示サイズ'), h('select', { onchange: (event: Event) => void update({ size: (event.target as HTMLSelectElement).value as 'small' }) },
      ...(['small', 'medium', 'large'] as const).map((size) => h('option', { value: size, selected: settings.size === size }, { small: '小', medium: '中', large: '大' }[size])))) : null,
    h('label', {}, h('span', {}, '背景と地面を表示'), h('input', { type: 'checkbox', checked: settings.groundBand, onchange: (event: Event) => void update({ groundBand: (event.target as HTMLInputElement).checked }) })),
    h('label', {}, h('span', {}, '節目の通知音'), h('input', { type: 'checkbox', checked: settings.audioEnabled, onchange: (event: Event) => void update({ audioEnabled: (event.target as HTMLInputElement).checked }) })),
    h('label', {}, h('span', {}, '通知音の音量'), h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(settings.audioVolume * 100)), disabled: !settings.audioEnabled, 'aria-label': translatedLabel('通知音の音量'), onchange: (event: Event) => void update({ audioVolume: Number((event.target as HTMLInputElement).value) / 100 }) })),
    h('p', { class: 'hint' }, '伝説・神話の発見、大ボス突破、10レベルごとの成長を短い音で知らせます。初期設定はOFF、1時間に最大10回です。'),
    state?.platform !== 'browser' ? h('label', {}, h('span', {}, `全画面のアプリ（ゲーム・動画・プレゼン）を使っている間は帯を隠す${state?.fullscreenSupported === false ? '（この環境では使えません）' : ''}`),
      h('input', { type: 'checkbox', checked: settings.hideOnFullscreen, disabled: state?.fullscreenSupported === false, onchange: (event: Event) => void update({ hideOnFullscreen: (event.target as HTMLInputElement).checked }) }))
      : null,
    state?.packaged ? h('label', {}, h('span', {}, 'Windowsにログオンしたら自動で起動する'),
      h('input', { type: 'checkbox', checked: settings.autoStart, onchange: (event: Event) => void update({ autoStart: (event.target as HTMLInputElement).checked }) })) : null,
    h('label', {}, h('span', {}, '描画のFPS上限'), h('select', { onchange: (event: Event) => void update({ fpsCap: Number((event.target as HTMLSelectElement).value) as 30 }) },
      ...[30, 15].map((fps) => h('option', { value: String(fps), selected: settings.fpsCap === fps }, `${fps}`)))),
    h('div', { class: 'row-line' }, h('span', {}, `データ：${state?.platform === 'browser' ? 'このブラウザー内（Windows版とは別）' : state?.profile === 'dev' ? '開発用（.dev-data）' : '利用者用'}`), h('button', { onclick: () => window.game.openSaveFolder() }, state?.platform === 'browser' ? 'セーブを書き出す' : 'セーブのフォルダを開く')),
    state?.platform !== 'browser' ? h('button', { onclick: () => window.game.exportSave() }, 'セーブを書き出す') : null,
    h('p', { class: 'hint' }, state?.platform === 'browser' ? 'ブラウザーを閉じるとゲームも終了します。次回起動時にオフライン報酬を計算します。' : '一時停止・帯の表示切り替え・終了は、タスクトレイのアイコンから行います。'),
    renderSaveImport(saveImport, Boolean(state?.storageError || state?.runtimeError)),
    renderCloudSettings({ profileReplaced, replacing: active => { profileReplacementPending = active } }))
}
function offlineModal(v: ProfileView) {
  const pending = v.pendingOffline
  // Recovery/export controls must remain reachable when claiming cannot be saved.
  if (!pending || state?.storageError) return null
  const minutes = Math.floor(pending.ms / 60000)
  return h('div', { class: 'modal' }, h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'offline-title', 'data-offline-dialog': '', 'data-panel-dialog': '', tabindex: '-1' },
    h('h2', { id: 'offline-title' }, 'おかえりなさい'),
    h('p', {}, `留守の${minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60}分` : `${minutes}分`}の間も、一行は旅を続けていました。`),
    h('p', {}, '経験値は不在時の出撃メンバーに付与します。受取時の入れ替えでは対象は変わりません。'),
    h('dl', {}, h('div', {}, h('dt', {}, '小判'), h('dd', {}, `+${fmt(pending.koban)}`)), h('div', {}, h('dt', {}, '経験値'), h('dd', {}, `+${fmt(pending.exp)}`))),
    h('p', {}, `${translatedLabel('装備の発見数')}：${fmt(pending.items ?? 0)}`),
    pending.items ? h('p', { class: 'hint' }, '発見した装備にも自動装備・自動売却・所持上限の設定が適用されます。') : null,
    h('button', { class: 'buy', 'data-focus-key': 'offline-claim', onclick: () => void command({ c: 'claimOffline' }) }, '受け取る')))
}

const panelPositions = new PanelPositions()
const dungeonTravelDraft = new DungeonTravelDraft()
function profileReplaced() {
  if (trainingTarget || compareItem) finishTraining('セーブを復元したため、装備目標と比較選択を解除しました。')
  compareItem = undefined; gearJob = undefined; gearFilter = 'all'; swapDraft = undefined; swapPicker = undefined; pendingChoiceFocus = undefined; pendingGearFocus = false; focusJob = undefined; trainingFocus = false
  render(true)
}
const saveImport = new SaveImportController(window.game, () => render(true), false, profileReplaced)
const modalFocus = new PanelModalFocus('[data-panel-dialog]', () => { void saveImport.cancel() })
function render(force = false) {
  if (pointerGuard.blocked || rendering) return
  if (view && trainingTarget && !saveImport.busy && !profileReplacementPending) {
    const ended = equipmentTrainingEnd(view, trainingTarget)
    if (ended) finishTraining(ended)
  }
  if (!force && root.contains(document.activeElement) && document.activeElement?.matches('select,input[type="number"],input[type="text"],input[type="search"],input[type="password"]')) return
  if (trainingNotice) { setToast(trainingNotice); trainingNotice = undefined }
  const v = artworkReady ? view : undefined
  modalFocus.beforeRender()
  document.documentElement.lang = getLocale()
  document.title = translatedLabel(brand.ja)
  const position = panelPositions.select(tab, capturePanelPosition(root))
  rendering = true
  try {
  root.replaceChildren(
    h('header', {},
      h('div', { class: 'brand' }, h('h1', {}, brand.ja), h('span', {}, v ? `${translatedLabel(v.stage.areaName)} ${translatedLabel(v.stage.label)}` : '')),
      h('div', { class: 'wallet' }, h('i', { class: 'coin' }), v ? fmt(v.koban) : '—')),
    h('nav', { 'aria-label': translatedLabel('画面の切り替え') }, ...tabs.map((entry) => h('button', { 'data-focus-key': `nav-${entry.id}`, 'aria-current': entry.id === tab ? 'page' : undefined, 'aria-controls': 'panel-content', class: entry.id === tab ? 'active' : '', onclick: () => { tab = entry.id; render() } }, entry.id === 'store' && storeView?.mode === 'unavailable' ? '外観' : entry.name))),
    state?.storageError ? h('div', { class: 'storage-error', role: 'alert' }, h('p', {}, state.storageError),
      state.platform !== 'browser' ? h('button', { disabled: commandPending, onclick: async () => {
        if (commandPending) return
        commandPending = true; render(true)
        try { if (!await window.game.retrySave()) showToast('保存を再試行しましたが、保存できませんでした。保存先を確認してください。') }
        catch (error) { showToast(reportRendererError('保存を再試行できませんでした。セーブを書き出して保護してください。', error)) }
        finally { commandPending = false; render(true) }
      } }, '保存を再試行') : null,
      h('button', { onclick: () => window.game.exportSave() }, 'セーブを書き出す')) : '',
    h('main', { id: 'panel-content' }, !v ? h('p', {}, '読み込み中…') : tab === 'party' ? partyTab(v) : tab === 'gear' ? gearTab(v) : tab === 'dojo' ? dojoTab(v) : tab === 'stage' ? renderDungeon(v, command, dungeonTravelDraft) : tab === 'dex' ? renderDex(v, spriteImage) : tab === 'store' ? storeView ? renderStore(storeView, { updated: next => { storeView = next; render(true) }, toast: showToast }) : h('p', {}, 'ストアを読み込み中…') : tab === 'help' ? renderHelp() : settingsTab()),
    renderSaveImportDialog(saveImport) ?? (v ? offlineModal(v) : null) ?? '',
    toast ? h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, toast) : '')
  assignFocusKeys(root, tab)
  restorePanelPosition(root, position)
  if (tab === 'gear' && pendingGearFocus) {
    const picker = root.querySelector<HTMLDetailsElement>('.reserve-picker')
    if (picker) picker.open = false
    const heading = root.querySelector<HTMLElement>('[data-focus-key="gear-heading"]')
    heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'nearest' }); pendingGearFocus = false
  }
  if (pendingChoiceFocus) {
    const requested = pendingChoiceFocus
    pendingChoiceFocus = undefined
    const candidate = tab === 'party' ? root.querySelector<HTMLElement>(`[data-focus-key="${requested}"]`) : null
    const target = candidate?.matches(':disabled') ? candidate.closest('.card')?.querySelector<HTMLElement>('.recruit-open') : candidate
    if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' }) }
  }
  if (focusJob) {
    const card = root.querySelector('.card.focus'), details = card?.querySelector('details')
    if (details) details.open = true
    card?.scrollIntoView({ block: 'nearest' }); focusJob = tab === 'party' ? focusJob : undefined
  }
  if (tab === 'party' && trainingFocus && trainingTarget) trainingFocus = !focusEquipmentTraining(root, trainingTarget.job)
  modalFocus.sync(root)
  } finally { rendering = false }
}

root.addEventListener('focusout', () => { if (!rendering) setTimeout(render, 0) })
window.game.onView((next) => { viewEvents++; view = next; render() })
window.game.onState((next) => { runtime.observe(next); if (runtime.stopped) return; stateEvents++; const errorChanged = state?.storageError !== next.storageError; state = next; syncNativeLocale(); if (tab === 'settings' || errorChanged) render(errorChanged) })
window.game.onNavigate((target) => {
  if (target.tab) tab = target.tab
  focusJob = target.job
  if (target.job) gearJob = target.job
  render()
  setTimeout(() => { focusJob = undefined }, 2500)
})
onLocaleChange(locale => {
  render(true)
  if (state && state.settings.locale !== locale && !applyingNativeLocale) void window.game.updateSettings({ locale }).catch(error => { syncNativeLocale(); showToast(reportRendererError('言語設定を保存できませんでした。', error)) })
})
// Artwork can finish after a live state event. An earlier initial snapshot must not erase a save error or pause change.
const initialEvents = { view: viewEvents, state: stateEvents }
void Promise.all([window.game.getView(), window.game.getState(), window.game.getStore(), portraitsReady, loadUiFonts()]).then(([nextView, nextState, nextStore]) => {
  artworkReady = true
  if (viewEvents === initialEvents.view) view = nextView
  if (stateEvents === initialEvents.state) state = nextState
  runtime.observe(state!); if (runtime.stopped) return
  storeView = nextStore; syncNativeLocale(); render()
}).catch(error => runtime.fail(error))
render()
