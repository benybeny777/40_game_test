import { loadUiFonts } from '../fonts'
import { runtimeFailure } from '../runtimeFailure'
import { AudioSession } from '../audioSession'
import { createAudioNotice } from '../audioNotice'
import { enemies, jobs, stageLabel, type JobId } from '../../core/index.ts'
import type { Frame, ShellState, StripLayout } from '../../shared/api'
import { Scene, type HitTarget } from './scene'
import { PLAY_DOTS } from '../../shared/art'
import { artReady } from './sprites/sheet'
import { VisibleFrames } from './visibleFrames'
import { onLocaleChange, setLocale, translatedLabel as tr } from '../../shared/i18n'
import '../../shared/locales/system'
import { createBattleText } from '../battleText'
import { reportRendererError } from '../errors'

const runtime = runtimeFailure(window.game)
const screen = document.querySelector<HTMLCanvasElement>('#screen')!
const tooltip = document.querySelector<HTMLElement>('#tooltip')!
const banner = document.querySelector<HTMLElement>('#banner')!
const labels = document.querySelector<HTMLElement>('#labels')!
const battleText = createBattleText(screen, banner)
const offscreen = document.createElement('canvas')
const off = offscreen.getContext('2d')!
const ctx = screen.getContext('2d')!

let layout: StripLayout = { dotPx: 3, playDots: PLAY_DOTS, scaleFactor: window.devicePixelRatio || 1, headroomDip: 72 }
let state: ShellState | undefined
let layoutEvents = 0, stateEvents = 0
let pendingFrame: Frame | undefined
const visibleFrames = new VisibleFrames()
let hover: HitTarget | null = null
let interactive = false
let bannerTimer: ReturnType<typeof setTimeout> | undefined

const scene = new Scene({
  banner(text, tone) {
    battleText.banner(text); banner.className = `show ${tone}`
    if (bannerTimer) clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => { banner.className = '' }, 1800)
  },
  label(text, dotX, dotY, color) {
    const element = document.createElement('div')
    const forgetLabel = battleText.label(element, text)
    element.className = 'label'; element.style.color = color
    const { x, y } = toCss(dotX, dotY)
    element.style.left = `${x}px`; element.style.top = `${y}px`
    labels.append(element)
    while (labels.childElementCount > 8) labels.firstElementChild?.remove()
    setTimeout(() => { forgetLabel(); element.remove() }, 1100)
  },
})

const dpr = () => window.devicePixelRatio || 1
const offsetTop = () => screen.height - scene.H * layout.dotPx
function toCss(dotX: number, dotY: number) { return { x: dotX * layout.dotPx / dpr(), y: (offsetTop() + dotY * layout.dotPx) / dpr() } }
function resize() {
  screen.width = Math.round(window.innerWidth * dpr()); screen.height = Math.round(window.innerHeight * dpr())
  scene.W = Math.max(1, Math.floor(screen.width / layout.dotPx)); scene.H = Math.max(1, Math.floor(screen.height / layout.dotPx))
  offscreen.width = scene.W; offscreen.height = scene.H
  banner.style.left = `${toCss(scene.baseX - 36, 0).x}px`
  banner.style.top = "4px"
}

let lastDraw = 0
let needsDraw = true
onLocaleChange(() => {
  battleText.translate(); needsDraw = true
  if (hover) showTooltip(hover)
})
function loop(now: number) {
  if (!visibleFrames.shown) return
  const cap = state?.settings.fpsCap ?? 30
  if (now - lastDraw < 1000 / cap - 2) return
  if (state?.paused && !scene.busy(now) && !needsDraw) return
  needsDraw = false
  lastDraw = now
  scene.groundBand = state?.settings.groundBand ?? true
  scene.paused = Boolean(state?.paused)
  scene.appearance = state?.appearance ?? null
  scene.draw(off, now)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, screen.width, screen.height)
  ctx.drawImage(offscreen, 0, offsetTop(), scene.W * layout.dotPx, scene.H * layout.dotPx)
  if (hover) showTooltip(hover)
}

function setInteractive(next: boolean) { if (interactive !== next) { interactive = next; window.game.pointer(next) } }
function tooltipText(target: HitTarget): string {
  const snap = scene.cur
  if (target.kind === 'hud') {
    if (!snap) return ''
    const label = stageLabel(snap.stageNo)
    return `<b>${tr(label.areaName)} ${tr(label.label)}</b><br>${tr(`ウェーブ ${snap.wave}/10`)}${snap.loop ? ` <span class="loop">${tr('周回中')}</span>` : ''}<br>${tr('小判')} ${Math.floor(snap.koban).toLocaleString()}<br><small>${tr('クリックでステージ画面')}</small>`
  }
  const unit = snap?.units.find((candidate) => candidate.uid === target.unit.uid) ?? target.unit
  const hp = `HP ${Math.ceil(unit.hp)}/${Math.round(unit.maxHp)}`
  if (unit.side === 'enemy') {
    const enemy = enemies[unit.defId]
    return `<b>${tr(enemy?.name ?? unit.defId)}${enemy?.boss ? tr('（ボス）') : ''}</b><br>${hp}<br><small>${tr(enemy?.desc ?? '')}</small>`
  }
  const job = jobs[unit.defId as JobId]
  const skill = tr(unit.skillReady >= 1 ? '準備OK' : `${Math.ceil((1 - unit.skillReady) * (job.skill.cooldownMs ?? 0) / 1000)}秒`)
  const ult = unit.ultOn ? `${tr(job.ultimate.name)} ${Math.floor(unit.ult)}%` : tr('奥義はLv10で解放')
  const jonen = unit.defId === 'jirai' ? `<br>${tr(`情念 ${Math.floor(unit.jonen ?? 0)}`)}` : ''
  return `<b style="color:${job.color}">${tr(job.name)}</b> Lv${unit.lv}<br>${unit.alive ? hp : tr('戦闘不能')}<br>${tr(job.skill.name)}: ${skill}<br>${ult}${jonen}<br><small>${tr('クリックで育成画面')}</small>`
}
function showTooltip(target: HitTarget) {
  tooltip.innerHTML = tooltipText(target)
  const anchor = toCss(scene.anchorOf(target).x, scene.anchorOf(target).y)
  const width = tooltip.offsetWidth, height = tooltip.offsetHeight
  tooltip.style.left = `${Math.min(window.innerWidth - width - 4, Math.max(4, anchor.x - width / 2))}px`
  tooltip.style.top = `${Math.max(2, anchor.y - height - 4)}px`
  tooltip.classList.add('show')
}
function hitAt(clientX: number, clientY: number) {
  const dotX = Math.floor(clientX * dpr() / layout.dotPx), dotY = Math.floor((clientY * dpr() - offsetTop()) / layout.dotPx)
  return scene.hitTest(dotX, dotY)
}
window.addEventListener('mousemove', (event) => {
  if (runtime.stopped) return
  hover = hitAt(event.clientX, event.clientY)
  setInteractive(hover !== null)
  if (hover) showTooltip(hover); else tooltip.classList.remove('show')
})
const leave = () => { if (runtime.stopped) return; hover = null; setInteractive(false); tooltip.classList.remove('show') }
window.addEventListener('mouseleave', leave)
window.addEventListener('blur', leave)
window.addEventListener('click', (event) => {
  if (runtime.stopped) return
  const target = hitAt(event.clientX, event.clientY)
  if (!target) return
  if (target.kind === 'hud') window.game.openPanel({ tab: 'stage' })
  else if (target.unit.side === 'ally') window.game.openPanel({ tab: 'party', job: target.unit.defId as JobId })
  else window.game.openPanel({ tab: 'dex' })
})
window.addEventListener('contextmenu', (event) => { event.preventDefault(); if (hitAt(event.clientX, event.clientY)) window.game.openMenu() })

window.addEventListener('resize', resize)
const audio = new AudioSession({ desktop: true, onChange: createAudioNotice(), onError: error => { reportRendererError('通知音を再生できませんでした。', error) } })
window.game.onLayout((next) => { layoutEvents++; layout = next; resize() })
window.game.onState((next) => { stateEvents++; state = next; syncVisibility(); audio.configure(next); setLocale(next.settings.locale ?? 'ja'); document.documentElement.lang = next.settings.locale ?? 'ja'; needsDraw = true })
function syncVisibility() {
  const accepted = visibleFrames.setVisible(Boolean(state?.visible && !state.fullscreenHidden))
  if (!visibleFrames.shown) {
    hover = null; setInteractive(false); tooltip.classList.remove('show')
    banner.className = ''; labels.replaceChildren()
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = undefined }
  }
  if (accepted) {
    if (artLoaded) present(accepted)
    else pendingFrame = accepted.frame
  }
  needsDraw = true
}
let artLoaded = false
function ingest(frame: Frame) {
  const accepted = visibleFrames.accept(frame)
  if (accepted) present(accepted)
}
function present({ frame, fresh }: { frame: Frame; fresh: boolean }) {
  audio.consume(frame)
  if (fresh) scene.resume(frame.snapshot, performance.now())
  else scene.ingest(frame, performance.now())
  const allies = frame.snapshot.units.filter(unit => unit.side === 'ally')
  battleText.party(allies.map(unit => unit.defId as JobId))
  needsDraw = true
}
window.game.onFrame((frame) => {
  if (!artLoaded) { pendingFrame = frame; return }
  runtime.run(() => ingest(frame))
})
const initialEvents = { layout: layoutEvents, state: stateEvents }
void Promise.all([window.game.getLayout(), window.game.getState(), artReady, loadUiFonts()]).then(([nextLayout, nextState]) => {
  if (layoutEvents === initialEvents.layout) layout = nextLayout
  if (stateEvents === initialEvents.state) state = nextState
  syncVisibility()
  audio.configure(state!);
  setLocale(state!.settings.locale ?? 'ja'); resize()
  artLoaded = true
  if (pendingFrame) { ingest(pendingFrame); pendingFrame = undefined }
  runtime.animate(loop)
}).catch(error => {
  runtime.fail(error)
  banner.textContent = reportRendererError('ゲームを読み込めませんでした。データは削除せず、再起動をお試しください。', error)
  banner.className = 'show bad'
})
