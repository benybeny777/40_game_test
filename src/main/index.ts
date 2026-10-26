import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { addOffline, computeOffline } from '../core/index.ts'
import { resolvePaths } from './paths'
import { stripLayout } from './windows/placement'
import { GameHost } from './loop'
import { createProbe, FullscreenWatcher } from './fullscreen'
import { loadProfile, loadSettings, saveProfile, saveSettings } from './saveStore'
import { channels, type PanelTarget, type Settings, type ShellState, type StripLayout } from '../shared/api'
import { parseCommand, parseSettings, parseTarget } from '../shared/validate'

app.setName('タスクバー百鬼行')
const paths = resolvePaths(resolve(__dirname, '../..'), app.getPath('userData'), process.env.GAME_PROFILE, process.env.GAME_DATA_DIR)
app.setPath('userData', paths.data)

let strip: BrowserWindow
let panel: BrowserWindow | undefined
let tray: Tray | undefined
let trayMenu: Menu
let host: GameHost
let layout: StripLayout
let quitting = false
let interactive = false
let pendingTarget: PanelTarget | undefined
let viewTimer: ReturnType<typeof setTimeout> | undefined
let fullscreenWatcher: FullscreenWatcher | undefined
const state: ShellState = { visible: true, paused: false, profile: paths.profile, settings: loadSettings(paths),
  packaged: app.isPackaged, fullscreenHidden: false, fullscreenSupported: false }

// Main-process operation also used by the local acceptance launcher.
export function getTrayMenu() { return trayMenu }
export { createProbe } from './fullscreen'

function log(message: string) {
  try { mkdirSync(paths.logs, { recursive: true }); appendFileSync(join(paths.logs, 'main.log'), `${new Date().toISOString()} ${message}\n`) } catch { /* logging must never stop the game */ }
}

const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()
else {
  mkdirSync(paths.session, { recursive: true })
  app.setPath('sessionData', paths.session)
  app.setAppLogsPath(paths.logs)
  app.on('second-instance', () => { if (app.isReady()) openPanel() })
  app.whenReady().then(start).catch((error) => { console.error(error); log(String(error)); app.exit(1) })
}

function webPreferences(extra: Electron.WebPreferences = {}) {
  return { preload: paths.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, ...extra }
}

function load(window: BrowserWindow, page: 'strip' | 'panel') {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, destination) => {
    const current = new URL(window.webContents.getURL())
    const next = new URL(destination)
    if (next.origin !== current.origin || next.pathname !== current.pathname) event.preventDefault()
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  const base = process.env.ELECTRON_RENDERER_URL
  const loaded = base ? window.loadURL(`${base}/${page}/index.html`) : window.loadFile(paths.renderer(page))
  void loaded.catch((error) => { console.error(error); app.quit() })
}

function sendView() {
  if (viewTimer) return
  viewTimer = setTimeout(() => {
    viewTimer = undefined
    if (panel && !panel.isDestroyed() && panel.isVisible()) panel.webContents.send(channels.view, host.view())
  }, 400)
}

function openPanel(target?: PanelTarget) {
  if (!panel || panel.isDestroyed()) {
    panel = new BrowserWindow({ width: 960, height: 600, minWidth: 620, minHeight: 420,
      title: 'タスクバー百鬼行', show: false, backgroundColor: '#121723', webPreferences: webPreferences() })
    panel.setMenu(null)
    pendingTarget = target
    panel.once('ready-to-show', () => { panel?.show(); if (pendingTarget) panel?.webContents.send(channels.navigate, pendingTarget); pendingTarget = undefined })
    panel.on('close', (event) => { if (!quitting) { event.preventDefault(); panel?.hide() } })
    panel.on('show', sendView)
    load(panel, 'panel')
  } else {
    panel.restore(); panel.show(); panel.focus()
    if (target) panel.webContents.send(channels.navigate, target)
    sendView()
  }
}

function pointer(ignore: boolean) {
  if (interactive === !ignore) return
  interactive = !ignore
  strip.setIgnoreMouseEvents(ignore, { forward: true })
}

function publish() {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channels.state, { ...state })
  if (tray) tray.setContextMenu(trayMenu = menu())
}

function menu() {
  return Menu.buildFromTemplate([
    { label: '管理パネルを開く', click: () => openPanel() },
    { label: state.visible ? '帯を隠す' : '帯を表示', click: () => {
      state.visible = !state.visible
      pointer(true)
      applyStripVisibility()
      publish()
    } },
    { label: state.paused ? '再開' : '一時停止', click: () => { state.paused = !state.paused; host.setPaused(state.paused); publish() } },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() },
  ])
}

/** The strip shows only when the user wants it AND no full-screen app is in front. */
function applyStripVisibility() {
  const show = state.visible && !state.fullscreenHidden
  if (show && !strip.isVisible()) { strip.showInactive(); strip.setAlwaysOnTop(true, 'screen-saver'); strip.webContents.send(channels.frame, host.frame()) }
  if (!show && strip.isVisible()) { pointer(true); strip.hide() }
}
function applyAutoStart() {
  // Only the packaged exe registers itself; a dev checkout must never add a login item.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: state.settings.autoStart, args: ['--startup'] })
}

function placeStrip() {
  const display = screen.getPrimaryDisplay()
  const placed = stripLayout(display.workArea, display.scaleFactor, state.settings.size)
  layout = placed.layout
  pointer(true)
  strip.setBounds(placed.bounds)
  strip.webContents.send(channels.layout, layout)
}

function applySettings(next: Partial<Settings>) {
  const sizeChanged = next.size !== undefined && next.size !== state.settings.size
  state.settings = { ...state.settings, ...next }
  try { saveSettings(paths, state.settings) } catch (error) { log(`settings save failed: ${String(error)}`) }
  if (sizeChanged) placeStrip()
  if (next.autoStart !== undefined) applyAutoStart()
  if (next.hideOnFullscreen === false) fullscreenWatcher?.stop()
  if (next.hideOnFullscreen === true) fullscreenWatcher?.start()
  publish()
  return { ...state }
}

function start() {
  const loaded = loadProfile(paths)
  if (loaded.errors.length) log(`save load: ${loaded.source} after ${loaded.errors.join(' / ')}`)
  if (loaded.source !== 'new') {
    const offline = computeOffline(loaded.profile, Date.now() - Date.parse(loaded.profile.savedAt))
    if (offline) addOffline(loaded.profile, offline)
  }
  const speed = paths.profile === 'dev' ? Math.min(50, Math.max(1, Number(process.env.GAME_SPEED) || 1)) : 1
  host = new GameHost(loaded.profile, randomInt(0, 2 ** 32 - 1), {
    frame: (frame) => { if (state.visible && !state.fullscreenHidden && !strip.isDestroyed()) strip.webContents.send(channels.frame, frame) },
    viewChanged: sendView,
    save: (profile) => {
      try { mkdirSync(dirname(paths.save), { recursive: true }); saveProfile(paths, profile) } catch (error) { log(`save failed: ${String(error)}`) }
    },
    offline: () => tray?.displayBalloon({ title: 'おかえりなさい', content: '留守の間の報酬が届いています。管理パネルで受け取れます。' }),
  }, speed)

  const display = screen.getPrimaryDisplay()
  const placed = stripLayout(display.workArea, display.scaleFactor, state.settings.size)
  layout = placed.layout
  strip = new BrowserWindow({ ...placed.bounds,
    title: 'タスクバー百鬼行 — 帯', frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, focusable: false, resizable: false, hasShadow: false, show: false,
    backgroundColor: '#00000000', webPreferences: webPreferences({ backgroundThrottling: false }) })
  strip.setIgnoreMouseEvents(true, { forward: true })
  strip.once('ready-to-show', () => { strip.setAlwaysOnTop(true, 'screen-saver'); applyStripVisibility() })
  strip.on('close', (event) => { if (!quitting) event.preventDefault() })
  strip.webContents.on('render-process-gone', () => app.quit())
  load(strip, 'strip')

  // Original 16x16 pixel tray emblem; BGRA bytes, no external asset/download.
  const pixels = Buffer.alloc(16 * 16 * 4)
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const index = (y * 16 + x) * 4
    const gold = x === 2 || x === 13 || y === 2 || y === 13 || (x >= 7 && x <= 8)
    pixels.set(gold ? [102, 198, 240, 255] : [43, 29, 23, 255], index)
  }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 16, height: 16 }))
  tray.setToolTip('タスクバー百鬼行')
  tray.setContextMenu(trayMenu = menu())
  tray.on('double-click', () => openPanel())
  if (loaded.profile.pendingOffline) tray.displayBalloon({ title: 'おかえりなさい', content: '留守の間の報酬が届いています。管理パネルで受け取れます。' })

  const fromStrip = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => event.sender === strip.webContents
  const fromPanel = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => panel !== undefined && !panel.isDestroyed() && event.sender === panel.webContents
  const fromKnown = (event: Electron.IpcMainInvokeEvent) => BrowserWindow.getAllWindows().some((win) => win.webContents === event.sender)
  ipcMain.on(channels.pointer, (event, value: unknown) => { if (fromStrip(event) && typeof value === 'boolean') pointer(!value) })
  ipcMain.on(channels.panel, (event, target: unknown) => { if (fromStrip(event)) openPanel(parseTarget(target)) })
  ipcMain.on(channels.menu, (event) => { if (fromStrip(event)) menu().popup() })
  ipcMain.handle(channels.getLayout, (event) => { if (!fromStrip(event)) throw new Error('Unknown window'); return layout })
  ipcMain.handle(channels.getState, (event) => { if (!fromKnown(event)) throw new Error('Unknown window'); return { ...state } })
  ipcMain.handle(channels.getView, (event) => { if (!fromPanel(event)) throw new Error('Unknown window'); return host.view() })
  ipcMain.handle(channels.command, (event, value: unknown) => {
    if (!fromPanel(event)) throw new Error('Unknown window')
    const command = parseCommand(value)
    return command ? host.command(command) : { ok: false, reason: '不正な操作です' }
  })
  ipcMain.handle(channels.settings, (event, value: unknown) => {
    if (!fromPanel(event)) throw new Error('Unknown window')
    const settings = parseSettings(value)
    return settings ? applySettings(settings) : { ...state }
  })
  ipcMain.on(channels.openSaveFolder, (event) => { if (fromPanel(event)) void shell.openPath(dirname(paths.save)) })

  const probe = createProbe(log)
  state.fullscreenSupported = probe !== null
  if (probe) {
    fullscreenWatcher = new FullscreenWatcher(probe, () => {
      const rect = screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds)
      return { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height }
    }, (hidden) => { state.fullscreenHidden = hidden; applyStripVisibility(); publish() }, log)
    if (state.settings.hideOnFullscreen) fullscreenWatcher.start()
  }
  applyAutoStart()

  screen.on('display-metrics-changed', placeStrip)
  screen.on('display-added', placeStrip)
  screen.on('display-removed', placeStrip)
  host.start()
  // Local smoke test of a packaged exe: quit through the normal path (saves) after N ms. Unset in normal use.
  const smoke = Number(process.env.GAME_SMOKE_QUIT_MS)
  if (smoke > 0) setTimeout(() => { log('smoke test: quitting'); app.quit() }, smoke)
}

app.on('before-quit', () => {
  quitting = true
  fullscreenWatcher?.stop()
  if (host) { host.stop(); host.saveNow() }
  tray?.destroy()
})
// Closing the panel only hides it; the tray owns the lifetime.
app.on('window-all-closed', () => { if (quitting) app.quit() })
