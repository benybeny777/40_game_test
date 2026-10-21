import type { JobId, MemberView, ProfileView } from '../../core/index.ts'
import type { PanelTab, ShellState } from '../../shared/api'
import { frameAt, sheets } from '../strip/sprites/sheet'

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
  ctx.drawImage(frameAt(sheet, 'idle', 0).normal, 0, sheet.top, sheet.width, sheet.height - sheet.top, 0, 0, sheet.width * scale, (sheet.height - sheet.top) * scale)
  if (silhouette) { ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#2c3242'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  return canvas
}

const tabs: Array<{ id: PanelTab; name: string }> = [
  { id: 'party', name: 'パーティ' }, { id: 'dojo', name: '道場' }, { id: 'stage', name: 'ステージ' }, { id: 'dex', name: '図鑑' }, { id: 'settings', name: '設定' },
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
  return h('article', { class: `card${focusJob === member.job ? ' focus' : ''}`, style: `--job:${member.color}` },
    h('div', { class: 'card-head' },
      spriteImage(member.job, 3),
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
    h('p', { class: 'hint' }, '先頭が前衛です。近接の敵は先頭を狙います。並び替えは次のウェーブから反映されます。'),
    h('div', { class: 'cards' }, ...v.party.map((member, index) => memberCard(member, index, order))))
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
    h('p', { class: 'hint' }, 'エリア2「シャッター商店街」以降は準備中です。1-5のクリア後は1-5を周回します。'),
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
    h('main', {}, !v ? h('p', {}, '読み込み中…') : tab === 'party' ? partyTab(v) : tab === 'dojo' ? dojoTab(v) : tab === 'stage' ? stageTab(v) : tab === 'dex' ? dexTab(v) : settingsTab()),
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
  render()
  setTimeout(() => { focusJob = undefined }, 2500)
})
void Promise.all([window.game.getView(), window.game.getState()]).then(([nextView, nextState]) => { view = nextView; state = nextState; render() })
render()
