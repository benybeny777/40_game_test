import { enemies, jobs, stageLabel, type JobId } from '../../core/index.ts'
import type { ShellState, StripLayout } from '../../shared/api'
import { Scene, type HitTarget } from './scene'
import { PLAY_DOTS } from '../../shared/art'
import { artReady } from './sprites/sheet'

const screen = document.querySelector<HTMLCanvasElement>('#screen')!
const tooltip = document.querySelector<HTMLElement>('#tooltip')!
const banner = document.querySelector<HTMLElement>('#banner')!
const labels = document.querySelector<HTMLElement>('#labels')!
const offscreen = document.createElement('canvas')
const off = offscreen.getContext('2d')!
const ctx = screen.getContext('2d')!

let layout: StripLayout = { dotPx: 3, playDots: PLAY_DOTS, scaleFactor: window.devicePixelRatio || 1, headroomDip: 72 }
let state: ShellState | undefined
let hover: HitTarget | null = null
let interactive = false
let bannerTimer: ReturnType<typeof setTimeout> | undefined

const scene = new Scene({
  banner(text, tone) {
    banner.textContent = text; banner.className = `show ${tone}`
    if (bannerTimer) clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => { banner.className = '' }, 1800)
  },
  label(text, dotX, dotY, color) {
    const element = document.createElement('div')
    element.className = 'label'; element.textContent = text; element.style.color = color
    const { x, y } = toCss(dotX, dotY)
    element.style.left = `${x}px`; element.style.top = `${y}px`
    labels.append(element)
    while (labels.childElementCount > 8) labels.firstElementChild?.remove()
    setTimeout(() => element.remove(), 1100)
  },
})

const dpr = () => window.devicePixelRatio || 1
const offsetTop = () => screen.height - scene.H * layout.dotPx
function toCss(dotX: number, dotY: number) { return { x: dotX * layout.dotPx / dpr(), y: (offsetTop() + dotY * layout.dotPx) / dpr() } }
function resize() {
  screen.width = Math.round(window.innerWidth * dpr()); screen.height = Math.round(window.innerHeight * dpr())
  scene.W = Math.floor(screen.width / layout.dotPx); scene.H = Math.floor(screen.height / layout.dotPx)
  offscreen.width = scene.W; offscreen.height = scene.H
  banner.style.left = `${toCss(scene.baseX - 36, 0).x}px`
  banner.style.top = "4px"
}

let lastDraw = 0
function loop(now: number) {
  requestAnimationFrame(loop)
  const cap = state?.settings.fpsCap ?? 30
  if (now - lastDraw < 1000 / cap - 2) return
  if (state?.paused && !scene.busy(now)) return
  lastDraw = now
  scene.groundBand = state?.settings.groundBand ?? true
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
    return `<b>${label.areaName} ${label.label}</b><br>ウェーブ ${snap.wave}/10${snap.loop ? ' <span class="loop">周回中</span>' : ''}<br>小判 ${Math.floor(snap.koban).toLocaleString()}<br><small>クリックでステージ画面</small>`
  }
  const unit = snap?.units.find((candidate) => candidate.uid === target.unit.uid) ?? target.unit
  const hp = `HP ${Math.ceil(unit.hp)}/${Math.round(unit.maxHp)}`
  if (unit.side === 'enemy') {
    const enemy = enemies[unit.defId]
    return `<b>${enemy?.name ?? unit.defId}${enemy?.boss ? '（ボス）' : ''}</b><br>${hp}<br><small>${enemy?.desc ?? ''}</small>`
  }
  const job = jobs[unit.defId as JobId]
  const skill = unit.skillReady >= 1 ? '準備OK' : `${Math.ceil((1 - unit.skillReady) * (job.skill.cooldownMs ?? 0) / 1000)}秒`
  const ult = unit.ultOn ? `${job.ultimate.name} ${Math.floor(unit.ult)}%` : `奥義はLv10で解放`
  const jonen = unit.defId === 'jirai' ? `<br>情念 ${Math.floor(unit.jonen ?? 0)}` : ''
  return `<b style="color:${job.color}">${job.name}</b> Lv${unit.lv}<br>${unit.alive ? hp : '戦闘不能'}<br>${job.skill.name}：${skill}<br>${ult}${jonen}<br><small>クリックで育成画面</small>`
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
  hover = hitAt(event.clientX, event.clientY)
  setInteractive(hover !== null)
  if (hover) showTooltip(hover); else tooltip.classList.remove('show')
})
const leave = () => { hover = null; setInteractive(false); tooltip.classList.remove('show') }
window.addEventListener('mouseleave', leave)
window.addEventListener('blur', leave)
window.addEventListener('click', (event) => {
  const target = hitAt(event.clientX, event.clientY)
  if (!target) return
  if (target.kind === 'hud') window.game.openPanel({ tab: 'stage' })
  else if (target.unit.side === 'ally') window.game.openPanel({ tab: 'party', job: target.unit.defId as JobId })
  else window.game.openPanel({ tab: 'dex' })
})
window.addEventListener('contextmenu', (event) => { event.preventDefault(); if (hitAt(event.clientX, event.clientY)) window.game.openMenu() })

window.addEventListener('resize', resize)
window.game.onLayout((next) => { layout = next; resize() })
window.game.onState((next) => { state = next })
let artLoaded = false
window.game.onFrame((frame) => { if (artLoaded) scene.ingest(frame, performance.now()) })
void Promise.all([window.game.getLayout(), window.game.getState()]).then(([nextLayout, nextState]) => {
  layout = nextLayout; state = nextState; resize()
})
resize()
void artReady.then(() => { artLoaded = true; requestAnimationFrame(loop) }).catch(() => {
  banner.textContent = '画像を読み込めませんでした。再起動してください。'; banner.className = 'show bad'
})
