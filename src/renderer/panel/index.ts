import type { ItemView, JobId, MemberView, ProfileView, SlotId } from '../../core/index.ts'
import type { PanelTab, ShellState } from '../../shared/api'
import { artReady, frameAt, sheets } from '../strip/sprites/sheet'

type Child = Node | string | null | undefined | false
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value as EventListener)
    else if (key === 'class') element.className = String(value)
    else if (key === 'style') element.setAttribute('style', String(value))
    else element.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child)
  return element
}
const fmt = (value: number) => Math.floor(value).toLocaleString('ja-JP')
function spriteImage(defId: string, scale: number, silhouette = false) {
  const sheet = sheets[defId]
  const canvas = h('canvas', { class: 'sprite', width: sheet.width * scale, height: (sheet.height - sheet.top) * scale })
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const portrait = sheet.portrait
  if (portrait) {
    const ratio = Math.min(canvas.width / portrait.width, canvas.height / portrait.height)
    const width = Math.round(portrait.width * ratio), height = Math.round(portrait.height * ratio)
    ctx.drawImage(portrait, Math.floor((canvas.width - width) / 2), canvas.height - height, width, height)
  } else ctx.drawImage(frameAt(sheet, 'idle', 0).normal, 0, sheet.top, sheet.width, sheet.height - sheet.top, 0, 0, sheet.width * scale, (sheet.height - sheet.top) * scale)
  if (silhouette) { ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#2c3242'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  return canvas
}

const tabs: Array<{ id: PanelTab; name: string }> = [
  { id: 'party', name: 'パーティ' }, { id: 'gear', name: '装備' }, { id: 'dojo', name: '道場' }, { id: 'stage', name: 'ステージ' }, { id: 'dex', name: '図鑑' }, { id: 'settings', name: '設定' },
]
let tab: PanelTab = 'party'
let focusJob: JobId | undefined
let view: ProfileView | undefined
let state: ShellState | undefined
let pressing = false
let toast = ''
let toastTimer: ReturnType<typeof setTimeout> | undefined

const root = document.querySelector<HTMLElement>('#app')!
async function command(...args: Parameters<typeof window.game.command>) {
  const result = await window.game.command(...args)
  if (!result.ok) showToast(result.reason)
  view = await window.game.getView(); render()
}
function showToast(text: string) {
  toast = text; render()
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast = ''; render() }, 2400)
}

function memberCard(member: MemberView, index: number, order: JobId[]) {
  const move = (delta: number) => {
    const next = [...order], target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    void command({ c: 'reorderParty', order: next })
  }
  const s = member.stats
  return h('article', { class: `card${focusJob === member.job ? ' focus' : ''}`, 'data-job': member.job, style: `--job:${member.color}` },
    h('div', { class: 'card-head' },
      spriteImage(member.job, 2),
      h('div', {},
        h('div', { class: 'slot' }, index === 0 ? '前衛（先頭）' : `${index + 1}番目`),
        h('h3', {}, member.name, h('span', { class: 'lv' }, `Lv ${member.lv}`)),
        h('div', { class: 'role' }, member.role),
        h('div', { class: 'exp' }, h('i', { style: `width:${Math.min(100, member.exp / member.expNext * 100)}%` })),
        h('small', {}, `次のLvまで ${fmt(member.expNext - member.exp)}`))),
    h('dl', { class: 'stats' },
      ...([['HP', fmt(s.hp)], ['攻撃', s.atk], ['防御', s.def], ['間隔', `${s.interval}秒`], ['会心', `${s.cri}%`], ['回避', `${s.eva}%`], ['運', s.luk], ['射程', s.range]] as const)
        .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(v))))),
    h('ul', { class: 'skills' }, ...member.skills.map((skill) => h('li', { class: skill.unlocked ? '' : 'locked' },
      h('span', { class: 'kind' }, skill.kind), h('b', {}, skill.name), h('p', {}, skill.unlocked ? skill.desc : `Lv${skill.unlockLv}で解放`)))),
    h('div', { class: 'order' },
      h('button', { onclick: () => move(-1), disabled: index === 0, title: '前へ' }, '◀ 前へ'),
      h('button', { onclick: () => move(1), disabled: index === order.length - 1, title: '後ろへ' }, '後ろへ ▶')))
}

function partyTab(v: ProfileView) {
  const order = v.party.map((member) => member.job)
  return h('section', {},
    h('div', { class: 'journey' },
      h('div', {}, h('span', { class: 'eyebrow' }, '裏・東京をゆく、五人の百鬼行'), h('h2', {}, '旅の仲間'),
        h('p', {}, `${v.stage.areaName} ${v.stage.label} を冒険中。装備を整え、次の妖怪に挑もう。`)),
      h('button', { class: 'journey-link', onclick: () => { tab = 'gear'; render() } }, '装備を整える →')),
    h('div', { class: 'roster' }, ...v.party.map((member) => h('button', { style: `--job:${member.color}`, onclick: () => root.querySelector(`[data-job="${member.job}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) },
      spriteImage(member.job, 2), h('b', {}, member.name), h('small', {}, `Lv ${member.lv}`)))),
    h('p', { class: 'hint' }, '先頭が前衛です。近接の敵は先頭を狙います。並び替えは次のウェーブから反映されます。'),
    h('div', { class: 'cards' }, ...v.party.map((member, index) => memberCard(member, index, order))))
}
let gearJob: JobId | undefined
let gearFilter: SlotId | 'all' = 'all'
let seenSent = false
const slotNames: Record<SlotId, string> = { weapon: '武器', armor: '防具', charm: 'お守り' }
function itemCard(item: ItemView, job: JobId, worn: boolean) {
  const delta = item.delta[job]
  const diff = delta === undefined ? h('span', { class: 'delta none' }, item.jobName ? `${item.jobName}専用` : '装備不可')
    : worn ? h('span', { class: 'delta' }, '装備中')
    : h('span', { class: `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}` }, delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : '±0')
  return h('div', { class: `item${item.isNew ? ' new' : ''}`, style: `--rarity:${item.color}` },
    h('div', { class: 'item-head' },
      h('span', { class: 'rarity' }, item.rarityName), h('b', {}, item.name), h('small', {}, `${item.slotName} Lv${item.ilvl}`), item.isNew ? h('em', {}, 'NEW') : null, diff),
    h('p', { class: 'lines' }, item.lines.join(' / ')),
    h('div', { class: 'item-actions' },
      worn ? h('button', { onclick: () => void command({ c: 'equip', job, slot: item.slot, itemId: null }) }, '外す')
        : delta !== undefined ? h('button', { class: 'primary', onclick: () => void command({ c: 'equip', job, slot: item.slot, itemId: item.id }) }, '装備する') : null,
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
    h('div', { class: 'jobs' }, ...v.party.map((entry) => h('button', { class: entry.job === job ? 'active' : '', style: `--job:${entry.color}`, onclick: () => { gearJob = entry.job; render() } },
      spriteImage(entry.job, 1), h('span', {}, entry.name), h('small', {}, `Lv${entry.lv}`)))),
    h('div', { class: 'gear-body' },
      h('div', { class: 'worn' },
        h('h3', {}, `${member.name}の装備`),
        h('dl', { class: 'stats' }, ...([['HP', fmt(member.stats.hp)], ['攻撃', member.stats.atk], ['防御', member.stats.def], ['間隔', `${member.stats.interval}秒`], ['会心', `${member.stats.cri}%`], ['回避', `${member.stats.eva}%`], ['運', member.stats.luk]] as const)
          .map(([k, value]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(value))))),
        ...(Object.keys(slotNames) as SlotId[]).map((slot) => member.equip[slot] ? itemCard(member.equip[slot]!, job, true)
          : h('div', { class: 'item empty' }, h('span', {}, slotNames[slot]), h('p', {}, 'なし')))),
      h('div', { class: 'bag' },
        h('div', { class: 'filters' }, ...(['all', 'weapon', 'armor', 'charm'] as const).map((key) => h('button', { class: gearFilter === key ? 'active' : '', onclick: () => { gearFilter = key; render() } }, key === 'all' ? 'すべて' : slotNames[key]))),
        list.length ? h('div', { class: 'items' }, ...list.map((item) => itemCard(item, job, false))) : h('p', { class: 'hint' }, '持ち物はありません。敵を倒すとたまに装備を落とします（ボスは必ず）。'))))
}
function dojoTab(v: ProfileView) {
  return h('section', {},
    h('p', { class: 'hint' }, '小判で全員を永続的に強化します。'),
    h('div', { class: 'rows' }, ...v.dojo.map((entry) => h('div', { class: 'row' },
      h('div', {}, h('b', {}, entry.name), h('span', { class: 'lv' }, `段階 ${entry.level}${entry.max === null ? '' : ` / ${entry.max}`}`), h('p', {}, entry.desc)),
      h('button', { class: 'buy', disabled: !entry.affordable, onclick: () => void command({ c: 'buyDojo', key: entry.key }) },
        entry.max !== null && entry.level >= entry.max ? '最大' : `小判 ${fmt(entry.cost)}`)))))
}
function stageTab(v: ProfileView) {
  return h('section', {},
    h('div', { class: 'loop-row' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: v.stage.loop, onchange: (event: Event) => void command({ c: 'setLoop', loop: (event.target as HTMLInputElement).checked }) }),
        h('span', {}, '周回モード（今のステージを繰り返す）')),
      h('span', { class: 'rates' }, `小判 ${v.rates.kobanPerMin}/分  経験値 ${v.rates.expPerMin}/分`)),
    h('p', { class: 'hint' }, '3回続けて全滅すると、ひとつ前のステージで鍛え直してから再挑戦します。各ステージの10ウェーブ目はボスです。'),
    h('div', { class: 'stages' }, ...v.stages.map((stage) => h('button', {
      class: `stage${stage.current ? ' current' : ''}`, disabled: !stage.unlocked,
      onclick: () => void command({ c: 'selectStage', stageNo: stage.no }) },
      h('b', {}, stage.label), h('span', {}, stage.unlocked ? stage.areaName : '未解放'), stage.current ? h('em', {}, '挑戦中') : null))),
    h('p', { class: 'hint' }, 'エリア1「夜の街道」→2「シャッター商店街」→3「電脳街」。3-5のクリア後は3-5を周回します。'),
    h('dl', { class: 'record' },
      ...([['撃破', fmt(v.stats.kills)], ['ボス撃破', fmt(v.stats.bossKills)], ['ステージクリア', fmt(v.stats.stageClears)], ['全滅', fmt(v.stats.wipes)],
        ['累計小判', fmt(v.totalKoban)], ['プレイ時間', `${Math.floor(v.stats.playMs / 3600000)}時間${Math.floor(v.stats.playMs / 60000) % 60}分`]] as const)
        .map(([k, value]) => h('div', {}, h('dt', {}, k), h('dd', {}, value)))))
}
function dexTab(v: ProfileView) {
  return h('section', {}, h('div', { class: 'dex' }, ...v.dex.map((enemy) => h('div', { class: `entry${enemy.seen ? '' : ' unseen'}` },
    spriteImage(enemy.id, enemy.boss ? 2 : 3, !enemy.seen),
    h('b', {}, enemy.seen ? enemy.name : '？？？', enemy.boss ? h('span', { class: 'boss' }, 'ボス') : null),
    h('p', {}, enemy.seen ? enemy.desc : 'まだ出会っていない')))))
}
function settingsTab() {
  const settings = state?.settings
  if (!settings) return h('section', {})
  const update = async (next: Parameters<typeof window.game.updateSettings>[0]) => { state = await window.game.updateSettings(next); render() }
  return h('section', { class: 'settings' },
    h('label', {}, h('span', {}, '表示サイズ'), h('select', { onchange: (event: Event) => void update({ size: (event.target as HTMLSelectElement).value as 'small' }) },
      ...(['small', 'medium', 'large'] as const).map((size) => h('option', { value: size, selected: settings.size === size }, { small: '小', medium: '中', large: '大' }[size])))),
    h('label', {}, h('span', {}, '地面の帯（明るい画面で見やすく）'), h('input', { type: 'checkbox', checked: settings.groundBand, onchange: (event: Event) => void update({ groundBand: (event.target as HTMLInputElement).checked }) })),
    h('label', {}, h('span', {}, `全画面のアプリ（ゲーム・動画・プレゼン）を使っている間は帯を隠す${state?.fullscreenSupported === false ? '（この環境では使えません）' : ''}`),
      h('input', { type: 'checkbox', checked: settings.hideOnFullscreen, disabled: state?.fullscreenSupported === false, onchange: (event: Event) => void update({ hideOnFullscreen: (event.target as HTMLInputElement).checked }) })),
    state?.packaged ? h('label', {}, h('span', {}, 'Windowsにログオンしたら自動で起動する'),
      h('input', { type: 'checkbox', checked: settings.autoStart, onchange: (event: Event) => void update({ autoStart: (event.target as HTMLInputElement).checked }) })) : null,
    h('label', {}, h('span', {}, '描画のFPS上限'), h('select', { onchange: (event: Event) => void update({ fpsCap: Number((event.target as HTMLSelectElement).value) as 30 }) },
      ...[30, 15].map((fps) => h('option', { value: String(fps), selected: settings.fpsCap === fps }, `${fps}`)))),
    h('div', { class: 'row-line' }, h('span', {}, `データ：${state?.profile === 'dev' ? '開発用（.dev-data）' : '利用者用'}`), h('button', { onclick: () => window.game.openSaveFolder() }, 'セーブのフォルダを開く')),
    h('p', { class: 'hint' }, '一時停止・帯の表示切り替え・終了は、タスクトレイのアイコンから行います。音は鳴りません。'))
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

function render() {
  if (pressing) return
  const v = view
  const scroll = root.querySelector('main')?.scrollTop ?? 0
  root.replaceChildren(
    h('header', {},
      h('div', { class: 'brand' }, h('h1', {}, 'タスクバー百鬼行'), h('span', {}, v ? `${v.stage.areaName} ${v.stage.label}` : '')),
      h('div', { class: 'wallet' }, h('i', { class: 'coin' }), v ? fmt(v.koban) : '—')),
    h('nav', {}, ...tabs.map((entry) => h('button', { class: entry.id === tab ? 'active' : '', onclick: () => { tab = entry.id; render() } }, entry.name))),
    h('main', {}, !v ? h('p', {}, '読み込み中…') : tab === 'party' ? partyTab(v) : tab === 'gear' ? gearTab(v) : tab === 'dojo' ? dojoTab(v) : tab === 'stage' ? stageTab(v) : tab === 'dex' ? dexTab(v) : settingsTab()),
    (v ? offlineModal(v) : null) ?? '',
    toast ? h('div', { class: 'toast' }, toast) : '')
  const main = root.querySelector('main')
  if (main) main.scrollTop = scroll
  if (focusJob) { root.querySelector('.card.focus')?.scrollIntoView({ block: 'nearest' }); focusJob = tab === 'party' ? focusJob : undefined }
}

window.addEventListener('pointerdown', () => { pressing = true })
window.addEventListener('pointerup', () => { pressing = false; setTimeout(render, 0) })
window.game.onView((next) => { view = next; render() })
window.game.onState((next) => { state = next; if (tab === 'settings') render() })
window.game.onNavigate((target) => {
  if (target.tab) tab = target.tab
  focusJob = target.job
  if (target.job) gearJob = target.job
  render()
  setTimeout(() => { focusJob = undefined }, 2500)
})
void Promise.all([window.game.getView(), window.game.getState(), artReady]).then(([nextView, nextState]) => { view = nextView; state = nextState; render() }).catch(() => { root.textContent = '画像を読み込めませんでした。ゲームを再起動してください。' })
render()
