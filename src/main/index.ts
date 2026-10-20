import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePaths } from './paths'
import { stripBounds } from './windows/placement'
import { channels, type ShellState } from '../shared/api'

app.setName('タスクバー百鬼行')
const paths = resolvePaths(resolve(__dirname, '../..'), app.getPath('userData'), process.env.GAME_PROFILE)
app.setPath('userData', paths.data)

let strip: BrowserWindow
let panel: BrowserWindow | undefined
let tray: Tray | undefined
let trayMenu: Menu
let quitting = false
let interactive = false
const state: ShellState = { visible: true, paused: false, profile: paths.profile }

// Main-process operation also used by the local acceptance launcher.
export function getTrayMenu() { return trayMenu }

const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()
else {
  mkdirSync(paths.session, { recursive: true })
  app.setPath('sessionData', paths.session)
  app.setAppLogsPath(paths.logs)
  app.on('second-instance', () => { if (app.isReady()) openPanel() })
  app.whenReady().then(start).catch((error) => { console.error(error); app.exit(1) })
}

function webPreferences() {
  return { preload: paths.preload, contextIsolation: true, nodeIntegration: false, sandbox: true }
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

function openPanel() {
  if (!panel || panel.isDestroyed()) {
    panel = new BrowserWindow({ width: 960, height: 600, minWidth: 620, minHeight: 420,
      title: 'タスクバー百鬼行 — M0', show: false, backgroundColor: '#121723', webPreferences: webPreferences() })
    panel.setMenu(null)
    panel.once('ready-to-show', () => panel?.show())
    panel.on('close', (event) => { if (!quitting) { event.preventDefault(); panel?.hide() } })
    load(panel, 'panel')
  } else { panel.restore(); panel.show(); panel.focus() }
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
    { label: '管理パネルを開く', click: openPanel },
    { label: state.visible ? '帯を隠す' : '帯を表示', click: () => {
      state.visible = !state.visible
      pointer(true)
      if (state.visible) strip.showInactive(); else strip.hide()
      publish()
    } },
    { label: state.paused ? '再開' : '一時停止', click: () => { state.paused = !state.paused; publish() } },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() },
  ])
}

function start() {
  strip = new BrowserWindow({ ...stripBounds(screen.getPrimaryDisplay().workArea),
    title: 'タスクバー百鬼行 — 帯', frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, focusable: false, resizable: false, hasShadow: false, show: false,
    backgroundColor: '#00000000', webPreferences: webPreferences() })
  strip.setIgnoreMouseEvents(true, { forward: true })
  strip.once('ready-to-show', () => { strip.setAlwaysOnTop(true, 'screen-saver'); strip.showInactive() })
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
  tray.setToolTip('タスクバー百鬼行（M0）')
  tray.setContextMenu(trayMenu = menu())
  tray.on('double-click', openPanel)

  ipcMain.on(channels.pointer, (event, value: unknown) => {
    if (event.sender === strip.webContents && typeof value === 'boolean') pointer(!value)
  })
  ipcMain.on(channels.panel, (event) => { if (event.sender === strip.webContents) openPanel() })
  ipcMain.on(channels.menu, (event) => { if (event.sender === strip.webContents) menu().popup() })
  ipcMain.handle(channels.getState, (event) => {
    if (!BrowserWindow.getAllWindows().some((win) => win.webContents === event.sender)) throw new Error('Unknown window')
    return { ...state }
  })
  const reposition = () => {
    pointer(true)
    strip.setBounds(stripBounds(screen.getPrimaryDisplay().workArea))
  }
  screen.on('display-metrics-changed', reposition)
  screen.on('display-added', reposition)
  screen.on('display-removed', reposition)
}

app.on('before-quit', () => { quitting = true; tray?.destroy() })
// Closing the panel only hides it; the tray owns the lifetime.
app.on('window-all-closed', () => { if (quitting) app.quit() })
