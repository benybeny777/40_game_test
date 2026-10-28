import { initializePlatform } from '../platform'
import { jobs, type JobId } from '../../core/index.ts'
import type { ShellState } from '../../shared/api'
import { Scene } from '../strip/scene'
import { artReady } from '../strip/sprites/sheet'
import { onLocaleChange, translatedLabel as tr } from '../../shared/i18n'
import '../../shared/locales/system'

async function start() {
  const api = initializePlatform()
  const screen = document.querySelector<HTMLCanvasElement>('#mobile-screen')!
  const banner = document.querySelector<HTMLElement>('#mobile-banner')!
  const pause = document.querySelector<HTMLButtonElement>('#mobile-pause')!
  const storage = document.querySelector<HTMLElement>('#mobile-storage-error')!
  let state: ShellState = await api.getState()
  let bannerTimer: ReturnType<typeof setTimeout> | undefined
  const message = (text: string) => {
    banner.textContent = tr(text); banner.classList.add('show')
    if (bannerTimer) clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => banner.classList.remove('show'), 2200)
  }
  const scene = new Scene({ banner: message, label: text => message(text) })
  const logical = document.createElement('canvas'), ctx = screen.getContext('2d')!, off = logical.getContext('2d')!
  let dotPx = 1, needsDraw = true
  function resize() {
    const rect = screen.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
    screen.width = Math.max(1, Math.round(rect.width * dpr)); screen.height = Math.max(1, Math.round(rect.height * dpr))
    dotPx = Math.max(1, Math.round(dpr))
    scene.W = Math.max(1, Math.floor(screen.width / dotPx)); scene.H = Math.max(1, Math.floor(screen.height / dotPx))
    logical.width = scene.W; logical.height = scene.H
    needsDraw = true
  }
  pause.addEventListener('click', () => api.openMenu())
  document.querySelector('#mobile-town')!.addEventListener('click', async () => {
    const result = await api.command({ c: 'returnTown' })
    if (!result.ok) message(result.reason)
    api.openPanel({ tab: 'stage' })
  })
  api.onState(next => {
    state = next; needsDraw = true; pause.textContent = tr(next.paused ? '再開' : '一時停止')
    const error = (next as ShellState & { storageError?: string }).storageError
    storage.textContent = tr(error ?? ''); storage.hidden = !error; pause.disabled = Boolean(error)
  })
  const translateControls = () => {
    pause.textContent = tr(state.paused ? '再開' : '一時停止')
    document.querySelector('#mobile-town')!.textContent = tr('街へ戻る')
    document.querySelector('#mobile-battle')!.setAttribute('aria-label', tr('冒険の様子'))
  }
  onLocaleChange(translateControls); translateControls()
  await artReady
  api.onFrame(frame => {
    scene.ingest(frame, performance.now())
    needsDraw = true
    const allies = frame.snapshot.units.filter(unit => unit.side === 'ally')
    screen.dataset.party = allies.map(unit => unit.defId).join(',')
    screen.setAttribute('aria-label', tr(`出撃中：${allies.map(unit => tr(jobs[unit.defId as JobId].name)).join(' / ')}`))
  })
  screen.addEventListener('click', event => {
    const rect = screen.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
    const hit = scene.hitTest((event.clientX - rect.left) * dpr / dotPx,
      scene.H - screen.height / dotPx + (event.clientY - rect.top) * dpr / dotPx)
    if (hit?.kind === 'unit') api.openPanel(hit.unit.side === 'ally' ? { tab: 'party', job: hit.unit.defId as JobId } : { tab: 'dex' })
    else if (hit?.kind === 'hud') api.openPanel({ tab: 'stage' })
  })
  window.addEventListener('resize', resize)
  resize()
  let lastDraw = 0
  function draw(now: number) {
    requestAnimationFrame(draw)
    if (document.hidden || now - lastDraw < 1000 / state.settings.fpsCap - 2) return
    if (state.paused && !needsDraw && !scene.busy(now)) return
    lastDraw = now; needsDraw = false; scene.groundBand = state.settings.groundBand; scene.appearance = state.appearance
    scene.draw(off, now)
    ctx.clearRect(0, 0, screen.width, screen.height); ctx.imageSmoothingEnabled = false
    ctx.drawImage(logical, 0, screen.height - scene.H * dotPx, scene.W * dotPx, scene.H * dotPx)
  }
  requestAnimationFrame(draw)
  await import('../panel/index')
}
void start().catch(error => {
  console.error(error)
  if (!document.querySelector('.browser-load-error')) {
    const root = document.querySelector('#app')!
    root.textContent = tr('ゲームを読み込めませんでした。保存データを消さずに、ページを読み直してください。')
  }
})
