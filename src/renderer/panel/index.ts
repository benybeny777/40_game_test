import { roleLabels, type JobRole, type ItemView, type JobId, type MemberView, type ProfileView, type SlotId } from '../../core/index.ts'
import type { PanelTab, ShellState } from '../../shared/api'
import { artReady } from '../strip/sprites/sheet'
import { attributeKeys, attributeLabels } from '../../core/data/attributes.ts'
import { difficulties } from '../../core/data/dungeon.ts'
import type { StoreView } from '../../shared/commerce'
import { renderStore } from './store'
import { renderHelp } from './help'
import { renderDex } from './dex'
import { initializePlatform } from '../platform'
import { formatNumber, getLocale, onLocaleChange, setLocale, t, translatedLabel } from '../../shared/i18n'
import './translations'
import '../../shared/locales/system'
import { h } from './dom'
import { spriteImage } from './portrait'
import { assignFocusKeys, capturePanelPosition, restorePanelPosition, PanelPositions } from './focus'

initializePlatform()

const fmt = (value: number) => formatNumber(Math.floor(value))

const tabs: Array<{ id: PanelTab; name: string }> = [
  { id: 'party', name: 'パーティ' }, { id: 'gear', name: '装備' }, { id: 'dojo', name: '道場' }, { id: 'stage', name: 'ダンジョン' }, { id: 'dex', name: '図鑑' }, { id: 'store', name: 'ストア' }, { id: 'help', name: 'あそびかた' }, { id: 'settings', name: '設定' },
]
let tab: PanelTab = 'party'
let focusJob: JobId | undefined
let view: ProfileView | undefined
let state: ShellState | undefined
let viewEvents = 0, stateEvents = 0
let storeView: StoreView | undefined
let applyingNativeLocale = false
function syncNativeLocale() {
  if (!state || state.platform === 'browser' || !state.settings.locale) return
  applyingNativeLocale = true
  try { setLocale(state.settings.locale) } finally { applyingNativeLocale = false }
}
let commandPending = false
let pressing = false
let rendering = false
let toast = ''
let toastTimer: ReturnType<typeof setTimeout> | undefined

const root = document.querySelector<HTMLElement>('#app')!
async function command(...args: Parameters<typeof window.game.command>) {
  if (commandPending) return
  commandPending = true
  try {
    const result = await window.game.command(...args)
    if (!result.ok) showToast(result.reason)
    view = await window.game.getView()
  } catch { showToast('操作を完了できませんでした。少し待って再度お試しください。') }
  finally { commandPending = false; render(true) }
}
function showToast(text: string) {
  toast = text; render()
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast = ''; render() }, 2400)
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
  return h('article', { class: `card${focusJob === member.job ? ' focus' : ''}`, 'data-job': member.job, 'data-focus-scope': `member-${member.job}`, style: `--job:${member.color}` },
    h('div', { class: 'card-head' },
      spriteImage(member.job, 2),
      h('div', {},
        h('div', { class: 'slot' }, member.active ? index === 0 ? '出撃・前衛（先頭）' : `出撃・${index + 1}番手` : '控え・育成と装備を保持'),
        h('h3', {}, member.name, h('span', { class: 'lv' }, `Lv ${member.lv}`)),
        h('span', { class: `role-badge role-${member.roleId}` }, member.role),
        h('div', { class: 'exp' }, h('i', { style: `width:${Math.min(100, member.exp / member.expNext * 100)}%` })),
        h('small', {}, `次のLvまで ${fmt(member.expNext - member.exp)}`))),
    h(member.active ? 'div' : 'details', { class: 'member-details' },
    member.active ? null : h('summary', {}, '能力・スキルを見る'),
    h('dl', { class: 'stats' },
      ...([['HP', fmt(s.hp)], ['攻撃', s.atk], ['防御', s.def], ['間隔', `${s.interval}秒`], ['会心', `${s.cri}%`], ['回避', `${s.eva}%`], ['運', s.luk], ['射程', s.range]] as const)
        .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(v))))),
    h('ul', { class: 'skills' }, ...member.skills.map((skill) => h('li', { class: skill.unlocked ? '' : 'locked' },
      h('span', { class: 'kind' }, skill.kind), h('b', {}, skill.name), h('p', {}, skill.unlocked ? skill.desc : `Lv${skill.unlockLv}で解放`)))),
    h('section', { class: 'attribute-panel' },
      h('h4', {}, 'ステータス配分', h('span', {}, `未使用 ${member.availablePoints} pt`)),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: member.autoStats, onchange: (event: Event) => void command({ c: 'setAutoStats', job: member.job, enabled: (event.target as HTMLInputElement).checked }) }), '自動振り'),
      h('p', { class: 'hint' }, `主属性：${attributeLabels[member.mainAttribute]}。自動配分 ${attributeKeys.map(key => `${attributeLabels[key]}${member.autoWeights[key]}`).join(' / ')}。手動にするには自動振りをOFFにします。`),
      ...attributeKeys.map(key => h('div', { class: 'attribute-row' },
        h('label', {}, `${translatedLabel(attributeLabels[key])} ${member.attributes[key]}`, h('small', {}, `基礎${member.baseAttributes[key]}＋配分${member.allocated[key]}`)),
        h('button', { 'data-focus-key': `allocate-${member.job}-${key}-one`, disabled: member.autoStats || member.availablePoints < 1, onclick: () => void command({ c: 'allocateStats', job: member.job, key, points: 1 }) }, '+1'),
        h('button', { 'data-focus-key': `allocate-${member.job}-${key}-all`, disabled: member.autoStats || member.availablePoints < 1, title: `未使用ポイントを全て${attributeLabels[key]}へ`, onclick: () => void command({ c: 'allocateStats', job: member.job, key, points: member.availablePoints }) }, '全振り'))),
      h('button', { class: 'reset-stats', onclick: () => void command({ c: 'resetStats', job: member.job }) }, '無料で振り直す'),
      h('small', { class: 'hint' }, '振り直すと全ポイントを回収し、自動振りをOFFにします。条件を満たさなくなった装備は持ち物に戻ります。'))),
    member.active ? h('div', { class: 'order' },
      h('button', { onclick: () => move(-1), disabled: index === 0, title: '前へ' }, '◀ 前へ'),
      h('button', { onclick: () => move(1), disabled: index === size - 1, title: '後ろへ' }, '後ろへ ▶')) : null,
    h('label', { class: 'swap-label' }, member.active ? 'メンバーを入れ替える' : '出撃メンバーと交代',
      h('select', { class: 'party-swap', 'data-current': member.job, onchange: (event: Event) => {
        const selected = (event.target as HTMLSelectElement).value as JobId
        const next = [...order], other = next.indexOf(selected)
        if (other < 0 || other === index) return
        ;[next[index], next[other]] = [next[other], next[index]]
        void command({ c: 'reorderParty', order: next })
      } }, h('option', { value: member.job, selected: true }, member.active ? '控えから選択…' : '交代する相手を選択…'),
      ...view!.party.filter((candidate) => candidate.active !== member.active).map((candidate) => h('option', { value: candidate.job }, candidate.name)))))
}

let reserveRole: JobRole | 'all' = 'all'
function partyTab(v: ProfileView) {
  const order = v.party.map((member) => member.job)
  return h('section', {},
    h('div', { class: 'journey' },
      h('div', {}, h('span', { class: 'eyebrow' }, '裏・東京をゆく、三人の百鬼行'), h('h2', {}, `出撃パーティ ${v.partySize}人`),
        h('p', {}, `${v.party.length}ジョブから3人を編成。${translatedLabel(v.stage.areaName)} ${translatedLabel(v.stage.label)} を冒険中。`)),
      h('button', { class: 'journey-link', onclick: () => { tab = 'gear'; render() } }, '装備を整える →')),
    h('div', { class: 'roster deployed-roster' }, ...v.party.filter(member => member.active).map((member) => h('button', { 'data-focus-key': `portrait-${member.job}`, style: `--job:${member.color}`, onclick: () => root.querySelector(`[data-job="${member.job}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) },
      spriteImage(member.job, 2), h('b', {}, member.name), h('small', {}, `Lv ${member.lv}`)))),
    h('p', { class: 'hint' }, '先頭が前衛です。出撃は3人。入れ替え・並び替えは次のウェーブから反映されます。控えも同じ経験値で育ち、装備を保持します。'),
    h('div', { class: 'cards deployed-cards' }, ...v.party.filter(member => member.active).map((member) => memberCard(member, order.indexOf(member.job), order))),
    h('h2', { class: 'reserve-title' }, `控え ${v.party.length - v.partySize}人`),
    h('p', { class: 'hint' }, '交代する相手を選ぶと、出撃メンバーと入れ替わります。控えの能力・スキル・運による効果は戦闘に加算されません。'),
    h('div', { class: 'filters role-filters' }, ...(['all', ...Object.keys(roleLabels)] as Array<JobRole | 'all'>).map(role => h('button', { 'data-focus-key': `reserve-role-${role}`, 'aria-pressed': String(reserveRole === role), class: reserveRole === role ? 'active' : '', onclick: () => { reserveRole = role; render() } }, role === 'all' ? 'すべて' : roleLabels[role]))),
    h('div', { class: 'cards reserve-cards' }, ...v.party.filter(member => !member.active && (reserveRole === 'all' || member.roleId === reserveRole)).map((member) => memberCard(member, order.indexOf(member.job), order))))
}
let gearJob: JobId | undefined
let gearFilter: SlotId | 'all' = 'all'
let seenSent = false
const slotNames: Record<SlotId, string> = { weapon: '武器', armor: '防具', charm: 'お守り' }
function itemCard(item: ItemView, job: JobId, worn: boolean) {
  const delta = item.delta[job] ?? 0, eligibility = item.equipable[job]
  const diff = !eligibility.ok ? h('span', { class: 'delta none' }, eligibility.reason)
    : worn ? h('span', { class: 'delta' }, '装備中')
    : h('span', { class: `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}` }, delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : '±0')
  return h('div', { class: `item${item.isNew ? ' new' : ''}`, 'data-focus-scope': `item-${item.id}`, style: `--rarity:${item.color}` },
    h('div', { class: 'item-head' },
      h('span', { class: 'rarity' }, item.rarityName), h('b', {}, item.name), h('small', {}, `${item.slotName}・装備ランク${item.ilvl}`), item.isNew ? h('em', {}, 'NEW') : null, diff),
    h('p', { class: 'lines' }, item.lines.map(translatedLabel).join(' / ')),
    h('div', { class: 'item-actions' },
      worn ? h('button', { onclick: () => void command({ c: 'equip', job, slot: item.slot, itemId: null }) }, '外す')
        : eligibility.ok ? h('button', { class: 'primary', onclick: () => void command({ c: 'equip', job, slot: item.slot, itemId: item.id }) }, '装備する') : null,
      h('button', { onclick: () => void command({ c: 'lock', itemId: item.id, locked: !item.locked }) }, item.locked ? '[ロック中]' : 'ロック'),
      worn ? null : h('button', { disabled: item.locked, onclick: () => void command({ c: 'sell', itemIds: [item.id] }) }, `売る（${fmt(item.sellPrice)}）`)))
}
function gearTab(v: ProfileView) {
  if (!seenSent && v.inventory.some((item) => item.isNew)) { seenSent = true; setTimeout(() => { seenSent = false; void window.game.command({ c: 'markSeen' }) }, 4000) }
  const job = gearJob && v.party.some((member) => member.job === gearJob) ? gearJob : v.party[0].job
  const member = v.party.find((entry) => entry.job === job)!
  const list = v.inventory.filter((item) => gearFilter === 'all' || item.slot === gearFilter)
    .sort((a, z) => (z.delta[job] ?? -1e9) - (a.delta[job] ?? -1e9) || z.rarity - a.rarity)
  const sellOptions = [null, 0, 1, 2] as const
  const owned = v.inventory.length + v.party.reduce((sum, entry) => sum + Object.values(entry.equip).filter(Boolean).length, 0)
  return h('section', { class: 'gear' },
    h('div', { class: 'gear-options' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: v.options.autoEquip, onchange: (event: Event) => void command({ c: 'setOptions', autoEquip: (event.target as HTMLInputElement).checked }) }), h('span', {}, '強い装備を自動で装備')),
      h('label', {}, h('span', {}, '拾ったら自動で売る：'), h('select', { onchange: (event: Event) => { const value = (event.target as HTMLSelectElement).value; void command({ c: 'setOptions', autoSellMaxRarity: value === '' ? null : Number(value) as 0 }) } },
        ...sellOptions.map((rarity) => h('option', { value: rarity === null ? '' : String(rarity), selected: v.options.autoSellMaxRarity === rarity }, rarity === null ? '売らない' : `${v.rarityNames[rarity]}以下`)))),
      h('button', { onclick: () => void command({ c: 'sellAll', maxRarity: 0 }) }, `${v.rarityNames[0]}をまとめて売る`),
      h('span', { class: 'count' }, `所持 ${owned} / ${v.inventoryMax}`)),
    h('div', { class: 'jobs' }, ...v.party.map((entry) => h('button', { 'data-focus-key': `gear-job-${entry.job}`, class: entry.job === job ? 'active' : '', style: `--job:${entry.color}`, onclick: () => { gearJob = entry.job; render() } },
      spriteImage(entry.job, 1), h('span', {}, entry.name), h('small', {}, `Lv${entry.lv}`)))),
    h('div', { class: 'gear-body' },
      h('div', { class: 'worn' },
        h('h3', {}, `${member.name}の装備`),
        h('dl', { class: 'stats' }, ...([['HP', fmt(member.stats.hp)], ['攻撃', member.stats.atk], ['防御', member.stats.def], ['間隔', `${member.stats.interval}秒`], ['会心', `${member.stats.cri}%`], ['回避', `${member.stats.eva}%`], ['運', member.stats.luk]] as const)
          .map(([k, value]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(value))))),
        ...(Object.keys(slotNames) as SlotId[]).map((slot) => member.equip[slot] ? itemCard(member.equip[slot]!, job, true)
          : h('div', { class: 'item empty' }, h('span', {}, slotNames[slot]), h('p', {}, 'なし')))),
      h('div', { class: 'bag' },
        h('div', { class: 'filters' }, ...(['all', 'weapon', 'armor', 'charm'] as const).map((key) => h('button', { 'data-focus-key': `gear-filter-${key}`, 'aria-pressed': String(gearFilter === key), class: gearFilter === key ? 'active' : '', onclick: () => { gearFilter = key; render() } }, key === 'all' ? 'すべて' : slotNames[key]))),
        list.length ? h('div', { class: 'items' }, ...list.map((item) => itemCard(item, job, false))) : h('p', { class: 'hint' }, '持ち物はありません。敵を倒すとたまに装備を落とします（ボスは必ず）。'))))
}
function dojoTab(v: ProfileView) {
  return h('section', {},
    h('p', { class: 'hint' }, '小判で全員を永続的に強化します。'),
    h('div', { class: 'rows' }, ...v.dojo.map((entry) => h('div', { class: 'row' },
      h('div', {}, h('b', {}, entry.name), h('span', { class: 'lv' }, `段階 ${entry.level}${entry.max === null ? '' : ` / ${entry.max}`}`), h('p', {}, entry.desc)),
      h('button', { 'data-focus-key': `dojo-${entry.key}`, class: 'buy', disabled: !entry.affordable, onclick: () => void command({ c: 'buyDojo', key: entry.key }) },
        entry.max !== null && entry.level >= entry.max ? '最大' : `小判 ${fmt(entry.cost)}`)))))
}
function stageTab(v: ProfileView) {
  const d = v.dungeon
  let targetFloor = d.depth
  return h('section', {},
    h('div', { class: 'dungeon-heading' },
      h('div', {}, h('span', { class: 'eyebrow' }, `${translatedLabel(d.name)} / ${translatedLabel(d.difficultyLabel)}`), h('h2', {}, d.town ? '街で休息中' : `地下 ${d.depth} 階`),
        h('p', {}, `${d.theme} ・最高到達 B${d.best} ・ ${d.floorLimit === null ? '終わりなき深淵' : `${d.floorLimit}階踏破で次の難度へ`}`)),
      d.town ? h('button', { class: 'buy', onclick: () => void command({ c: 'selectStage', stageNo: d.depth }) }, '探索を再開')
        : h('button', { class: 'return-town', onclick: () => void command({ c: 'returnTown' }) }, '街へ帰還')),
    h('div', { class: 'difficulty-tabs' }, ...difficulties.map(difficulty => h('button', { class: d.difficulty === difficulty.id ? 'active' : '', disabled: difficulty.id > d.unlockedDifficulty, onclick: () => void command({ c: 'selectStage', stageNo: 1, depthRank: difficulty.id }) },
      `${difficulty.name}${difficulty.floorLimit === null ? ' ∞' : ' 100階'}${difficulty.id > d.unlockedDifficulty ? '（未解放）' : ''}`))),
    h('div', { class: 'loop-row' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: v.stage.loop, onchange: (event: Event) => void command({ c: 'setLoop', loop: (event.target as HTMLInputElement).checked }) }),
        h('span', {}, '同じ階を周回する（OFFで下へ進む）')),
      h('span', { class: 'rates' }, `小判 ${v.rates.kobanPerMin}/分  経験値 ${v.rates.expPerMin}/分`)),
    h('p', { class: 'hint' }, '各階で10ウェーブ。10階ごとに大ボスが待ち受け、宝箱や祭壇が見つかることもあります。帰還しても装備や育成は失いません。'),
    h('form', { class: 'floor-jump', onsubmit: (event: Event) => { event.preventDefault(); void command({ c: 'selectStage', stageNo: targetFloor }) } },
      h('label', {}, '到達済みの階へ ', h('input', { type: 'number', min: 1, max: d.best, step: 1, value: d.depth, 'aria-label': '探索する地下階', oninput: (event: Event) => { targetFloor = Number((event.target as HTMLInputElement).value) } })),
      h('button', { type: 'submit' }, '出発')),
    h('div', { class: 'stages' }, ...v.stages.map((stage) => h('button', {
      class: `stage${stage.current ? ' current' : ''}`, disabled: !stage.unlocked,
      onclick: () => void command({ c: 'selectStage', stageNo: stage.no }) },
      h('b', {}, stage.label), h('span', {}, stage.unlocked ? stage.areaName : '未解放'), stage.current ? h('em', {}, d.town ? '再開地点' : '探索中') : null))),
    h('p', { class: 'hint' }, '通常と修羅は100階まで。深淵だけ100階を超えて進めます。3回続けて全滅すると、前の階で鍛え直して再挑戦します。'),
    h('dl', { class: 'record' },
      ...([['撃破', fmt(v.stats.kills)], ['ボス撃破', fmt(v.stats.bossKills)], ['ステージクリア', fmt(v.stats.stageClears)], ['全滅', fmt(v.stats.wipes)],
        ['累計小判', fmt(v.totalKoban)], ['プレイ時間', `${Math.floor(v.stats.playMs / 3600000)}時間${Math.floor(v.stats.playMs / 60000) % 60}分`]] as const)
        .map(([k, value]) => h('div', {}, h('dt', {}, k), h('dd', {}, value)))))
}
function settingsTab() {
  const settings = state?.settings
  if (!settings) return h('section', {})
  const update = async (next: Parameters<typeof window.game.updateSettings>[0]) => { state = await window.game.updateSettings(next); render() }
  return h('section', { class: 'settings' },
    h('label', {}, h('span', {}, t('language')), h('select', { 'aria-label': t('language'), onchange: (event: Event) => setLocale((event.target as HTMLSelectElement).value as 'ja' | 'en') },
      h('option', { value: 'ja', selected: getLocale() === 'ja' }, '日本語'), h('option', { value: 'en', selected: getLocale() === 'en' }, 'English'))),
    h('label', {}, h('span', {}, '表示サイズ'), h('select', { onchange: (event: Event) => void update({ size: (event.target as HTMLSelectElement).value as 'small' }) },
      ...(['small', 'medium', 'large'] as const).map((size) => h('option', { value: size, selected: settings.size === size }, { small: '小', medium: '中', large: '大' }[size])))),
    h('label', {}, h('span', {}, '地面の帯（明るい画面で見やすく）'), h('input', { type: 'checkbox', checked: settings.groundBand, onchange: (event: Event) => void update({ groundBand: (event.target as HTMLInputElement).checked }) })),
    state?.platform !== 'browser' ? h('label', {}, h('span', {}, `全画面のアプリ（ゲーム・動画・プレゼン）を使っている間は帯を隠す${state?.fullscreenSupported === false ? '（この環境では使えません）' : ''}`),
      h('input', { type: 'checkbox', checked: settings.hideOnFullscreen, disabled: state?.fullscreenSupported === false, onchange: (event: Event) => void update({ hideOnFullscreen: (event.target as HTMLInputElement).checked }) }))
      : null,
    state?.packaged ? h('label', {}, h('span', {}, 'Windowsにログオンしたら自動で起動する'),
      h('input', { type: 'checkbox', checked: settings.autoStart, onchange: (event: Event) => void update({ autoStart: (event.target as HTMLInputElement).checked }) })) : null,
    h('label', {}, h('span', {}, '描画のFPS上限'), h('select', { onchange: (event: Event) => void update({ fpsCap: Number((event.target as HTMLSelectElement).value) as 30 }) },
      ...[30, 15].map((fps) => h('option', { value: String(fps), selected: settings.fpsCap === fps }, `${fps}`)))),
    h('div', { class: 'row-line' }, h('span', {}, `データ：${state?.platform === 'browser' ? 'このブラウザー内（Windows版とは別）' : state?.profile === 'dev' ? '開発用（.dev-data）' : '利用者用'}`), h('button', { onclick: () => window.game.openSaveFolder() }, state?.platform === 'browser' ? 'セーブを書き出す' : 'セーブのフォルダを開く')),
    state?.platform !== 'browser' ? h('button', { onclick: () => window.game.exportSave() }, 'セーブを書き出す') : null,
    h('p', { class: 'hint' }, state?.platform === 'browser' ? 'ブラウザーを閉じるとゲームも終了します。次回起動時にオフライン報酬を計算します。' : '一時停止・帯の表示切り替え・終了は、タスクトレイのアイコンから行います。音は鳴りません。'))
}
function offlineModal(v: ProfileView) {
  const pending = v.pendingOffline
  if (!pending) return null
  const minutes = Math.floor(pending.ms / 60000)
  return h('div', { class: 'modal' }, h('div', { class: 'dialog' },
    h('h2', {}, 'おかえりなさい'),
    h('p', {}, `留守の${minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60}分` : `${minutes}分`}の間も、一行は旅を続けていました。`),
    h('dl', {}, h('div', {}, h('dt', {}, '小判'), h('dd', {}, `+${fmt(pending.koban)}`)), h('div', {}, h('dt', {}, '経験値'), h('dd', {}, `+${fmt(pending.exp)}`))),
    h('button', { class: 'buy', onclick: () => void command({ c: 'claimOffline' }) }, '受け取る')))
}

const panelPositions = new PanelPositions()
function render(force = false) {
  if (pressing || rendering) return
  if (!force && root.contains(document.activeElement) && document.activeElement?.matches('select,input[type="number"],input[type="text"],input[type="search"]')) return
  const v = view
  document.documentElement.lang = getLocale()
  document.title = translatedLabel('タスクバー百鬼行')
  const position = panelPositions.select(tab, capturePanelPosition(root))
  const openDetails = [...root.querySelectorAll<HTMLElement>('[data-job]')].filter(card => card.querySelector('details')?.open).map(card => card.dataset.job)
  rendering = true
  try {
  root.replaceChildren(
    h('header', {},
      h('div', { class: 'brand' }, h('h1', {}, 'タスクバー百鬼行'), h('span', {}, v ? `${translatedLabel(v.stage.areaName)} ${translatedLabel(v.stage.label)}` : '')),
      h('div', { class: 'wallet' }, h('i', { class: 'coin' }), v ? fmt(v.koban) : '—'),
      h('button', { type: 'button', class: 'language-toggle', 'data-focus-key': 'language-toggle', 'aria-label': t('language'), onclick: () => setLocale(getLocale() === 'ja' ? 'en' : 'ja') }, getLocale() === 'ja' ? 'English' : '日本語')),
    h('nav', { 'aria-label': translatedLabel('画面の切り替え') }, ...tabs.map((entry) => h('button', { 'data-focus-key': `nav-${entry.id}`, 'aria-current': entry.id === tab ? 'page' : undefined, 'aria-controls': 'panel-content', class: entry.id === tab ? 'active' : '', onclick: () => { tab = entry.id; render() } }, entry.name))),
    state?.storageError ? h('div', { class: 'storage-error', role: 'alert' }, h('p', {}, state.storageError),
      state.platform !== 'browser' ? h('button', { disabled: commandPending, onclick: async () => {
        if (commandPending) return
        commandPending = true; render(true)
        try { if (!await window.game.retrySave()) showToast('保存を再試行しましたが、保存できませんでした。保存先を確認してください。') }
        catch { showToast('保存を再試行できませんでした。セーブを書き出して保護してください。') }
        finally { commandPending = false; render(true) }
      } }, '保存を再試行') : null,
      h('button', { onclick: () => window.game.exportSave() }, 'セーブを書き出す')) : '',
    h('main', { id: 'panel-content' }, !v ? h('p', {}, '読み込み中…') : tab === 'party' ? partyTab(v) : tab === 'gear' ? gearTab(v) : tab === 'dojo' ? dojoTab(v) : tab === 'stage' ? stageTab(v) : tab === 'dex' ? renderDex(v, spriteImage) : tab === 'store' ? storeView ? renderStore(storeView, { updated: next => { storeView = next; render(true) }, toast: showToast }) : h('p', {}, 'ストアを読み込み中…') : tab === 'help' ? renderHelp() : settingsTab()),
    (v ? offlineModal(v) : null) ?? '',
    toast ? h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, toast) : '')
  assignFocusKeys(root, tab)
  for (const job of openDetails) { const details = root.querySelector<HTMLDetailsElement>(`[data-job="${job}"] details`); if (details) details.open = true }
  restorePanelPosition(root, position)
  if (focusJob) { root.querySelector('.card.focus')?.scrollIntoView({ block: 'nearest' }); focusJob = tab === 'party' ? focusJob : undefined }
  } finally { rendering = false }
}

window.addEventListener('pointerdown', () => { pressing = true })
window.addEventListener('pointerup', () => { pressing = false; setTimeout(render, 0) })
window.addEventListener('pointercancel', () => { pressing = false })
window.addEventListener('blur', () => { pressing = false })
root.addEventListener('focusout', () => { if (!rendering) setTimeout(render, 0) })
window.game.onView((next) => { viewEvents++; view = next; render() })
window.game.onState((next) => { stateEvents++; const errorChanged = state?.storageError !== next.storageError; state = next; syncNativeLocale(); if (tab === 'settings' || errorChanged) render(errorChanged) })
window.game.onNavigate((target) => {
  if (target.tab) tab = target.tab
  focusJob = target.job
  if (target.job) gearJob = target.job
  render()
  setTimeout(() => { focusJob = undefined }, 2500)
})
onLocaleChange(locale => {
  render(true)
  if (state && state.platform !== 'browser' && !applyingNativeLocale) void window.game.updateSettings({ locale }).catch(() => showToast('言語設定を保存できませんでした。'))
})
// Artwork can finish after a live state event. An earlier initial snapshot must not erase a save error or pause change.
const initialEvents = { view: viewEvents, state: stateEvents }
void Promise.all([window.game.getView(), window.game.getState(), window.game.getStore(), artReady]).then(([nextView, nextState, nextStore]) => {
  if (viewEvents === initialEvents.view) view = nextView
  if (stateEvents === initialEvents.state) state = nextState
  storeView = nextStore; syncNativeLocale(); render()
}).catch(() => { root.textContent = translatedLabel('ゲームを読み込めませんでした。データは削除せず、再起動をお試しください。') })
render()
