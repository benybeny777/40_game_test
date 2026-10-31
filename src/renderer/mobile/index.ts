import { loadUiFonts } from '../fonts'
import { runtimeFailure } from '../runtimeFailure'
import { AudioSession } from '../audioSession'
import { createAudioNotice } from '../audioNotice'
import { reportRendererError } from '../errors'
import { initializePlatform } from '../platform'
import type { JobId } from '../../core/index.ts'
import type { Frame, ShellState } from '../../shared/api'
import { VisibleFrames } from '../strip/visibleFrames'
import { Scene } from '../strip/scene'
import { artReady } from '../strip/sprites/sheet'
import { onLocaleChange, translatedLabel as tr } from '../../shared/i18n'
import '../../shared/locales/system'
import { createBattleText } from '../battleText'
import { createBattleNotice } from '../battleNotice'

async function start() {
  const api = initializePlatform()
  const runtime = runtimeFailure(api)
  const screen = document.querySelector<HTMLCanvasElement>('#mobile-screen')!
  const banner = document.querySelector<HTMLElement>('#mobile-banner')!
  const pause = document.querySelector<HTMLButtonElement>('#mobile-pause')!
  const town = document.querySelector<HTMLButtonElement>('#mobile-town')!
  let inTown = false
  const storage = document.querySelector<HTMLElement>('#mobile-storage-error')!
  const battleText = createBattleText(screen, banner)
  let state: ShellState = await api.getState()
  const message = createBattleNotice((text, tone) => {
    battleText.banner(text); banner.className = `show ${tone}`
  }, () => banner.classList.remove('show'), 2200)
  const visibleFrames = new VisibleFrames()
  visibleFrames.setVisible(!document.hidden)
  const audio = new AudioSession({ desktop: false, onChange: createAudioNotice(), onError: error => { reportRendererError('通知音を再生できませんでした。', error) } })
  audio.configure(state)
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
  town.addEventListener('click', async () => {
    if (!inTown) {
      const result = await api.command({ c: 'returnTown' })
      if (!result.ok) { message(result.reason); return }
    }
    api.openPanel({ tab: 'stage' })
  })
  api.onState(next => {
    state = next; audio.configure(next); translateControls()
  })
  function translateControls() {
    needsDraw = true
    pause.textContent = tr(state.paused ? '再開' : '一時停止')
    const error = state.storageError
    storage.textContent = error ? tr(error) : ''; storage.hidden = !error; pause.disabled = Boolean(error)
    town.textContent = tr(inTown ? '街で休息中' : '街へ戻る')
    town.disabled = Boolean(error)
    document.querySelector('#mobile-battle')!.setAttribute('aria-label', tr('冒険の様子'))
    battleText.translate()
  }
  onLocaleChange(translateControls); translateControls()
  await Promise.all([artReady, loadUiFonts()])
  function present({ frame, fresh }: { frame: Frame; fresh: boolean }) {
    const resting = frame.snapshot.phase === 'town'
    if (inTown !== resting) { inTown = resting; translateControls() }
    audio.consume(frame)
    if (fresh) scene.resume(frame.snapshot, performance.now())
    else scene.ingest(frame, performance.now())
    needsDraw = true
    const allies = frame.snapshot.units.filter(unit => unit.side === 'ally')
    battleText.party(allies.map(unit => unit.defId as JobId))
  }
  document.addEventListener('visibilitychange', () => runtime.run(() => {
    const accepted = visibleFrames.setVisible(!document.hidden)
    if (document.hidden) message.clear()
    if (accepted) present(accepted)
  }))
  // Loading artwork may cross a visibility change before frame listeners are attached.
  visibleFrames.setVisible(!document.hidden)
  api.onFrame(frame => runtime.run(() => {
    const accepted = visibleFrames.accept(frame)
    if (accepted) present(accepted)
  }))
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
    if (document.hidden || now - lastDraw < 1000 / state.settings.fpsCap - 2) return
    if (state.paused && !needsDraw && !scene.busy(now)) return
    lastDraw = now; needsDraw = false; scene.groundBand = state.settings.groundBand; scene.appearance = state.appearance
    scene.paused = state.paused
    scene.draw(off, now)
    ctx.clearRect(0, 0, screen.width, screen.height); ctx.imageSmoothingEnabled = false
    ctx.drawImage(logical, 0, screen.height - scene.H * dotPx, scene.W * dotPx, scene.H * dotPx)
  }
  runtime.animate(draw)
  await import('../panel/index')
}
void start().catch(error => {
  if (window.game) { runtimeFailure(window.game).fail(error); return }
  console.error(error)
  if (!document.querySelector('.browser-load-error')) {
    const root = document.querySelector('#app')!
    root.textContent = reportRendererError('ゲームを読み込めませんでした。保存データを消さずに、ページを読み直してください。', error)
  }
})
