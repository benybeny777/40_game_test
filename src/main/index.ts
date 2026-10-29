import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { addOffline, computeOffline } from '../core/index.ts'
import { resolvePaths } from './paths'
import { stripLayout } from './windows/placement'
import { GameHost } from './loop'
import { createProbe, FullscreenWatcher } from './fullscreen'
import { loadProfile, loadSettings, saveProfile, saveSettings, writeAtomic } from './saveStore'
import { commitSettings, confirmSavedQuit, isProtectedExport, PersistenceGuard, StoragePause } from './persistence'
import type { Profile } from '../core/index.ts'
import { channels, defaultSettings, type PanelTarget, type Settings, type ShellState, type StripLayout } from '../shared/api'
import { parseCommand, parseSettings, parseTarget } from '../shared/validate'
import { CommerceService } from '../commerce/service'
import { findProduct } from '../commerce/catalog'
import { setLocale, systemLocale, translatedLabel as tr } from '../shared/i18n'
import '../shared/locales/system'
import { CloudClient } from '../shared/cloudClient'
import { DEVELOPMENT_CLOUD_ENDPOINT, parseCloudCommand } from '../shared/cloud'
import { prepareCloudRestore } from '../shared/cloudProfile'

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
let handlingQuit = false
let interactive = false
let pendingTarget: PanelTarget | undefined
let viewTimer: ReturnType<typeof setTimeout> | undefined
let fullscreenWatcher: FullscreenWatcher | undefined
let commerce: CommerceService
let cloud: CloudClient
let previewTimer: ReturnType<typeof setTimeout> | undefined
let persistence: PersistenceGuard<Profile>
const storagePause = new StoragePause(() => state.paused, paused => { state.paused = paused; host.setPaused(paused) })
const state: ShellState = { visible: true, paused: false, profile: paths.profile, settings: { ...defaultSettings },
  packaged: app.isPackaged, fullscreenHidden: false, fullscreenSupported: false, appearance: null }
setLocale(state.settings.locale ?? 'ja')

// Main-process operation also used by the local acceptance launcher.
export function getTrayMenu() { return trayMenu }
export { createProbe } from './fullscreen'

function log(message: string) {
  try { mkdirSync(paths.logs, { recursive: true }); appendFileSync(join(paths.logs, 'main.log'), `${new Date().toISOString()} ${message}\n`) }
  catch (error) { console.error('Game log write failed', { message, error }) }
}

function reportError(title: string, error: unknown) {
  log(`${title}: ${String(error)}`)
  console.error(title, error)
  try { dialog.showErrorBox(tr(title), String(error)) }
  catch (dialogError) { console.error('Native error dialog failed', { title, error, dialogError }) }
}

const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()
else {
  mkdirSync(paths.session, { recursive: true })
  app.setPath('sessionData', paths.session)
  app.setAppLogsPath(paths.logs)
  app.on('second-instance', () => { if (app.isReady()) openPanel() })
  app.whenReady().then(start).catch((error) => {
    console.error(error); log(String(error))
    dialog.showErrorBox(tr('タスクバー百鬼行を起動できません'), tr(error instanceof Error ? error.message : String(error)))
    app.exit(1)
  })
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
      title: tr('タスクバー百鬼行'), show: false, backgroundColor: '#121723', webPreferences: webPreferences() })
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
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try { win.webContents.send(channels.state, { ...state }) } catch (error) { log('state notification failed: ' + String(error)) }
  }
  if (tray && !tray.isDestroyed()) {
    try { tray.setContextMenu(trayMenu = menu()) } catch (error) { log('tray notification failed: ' + String(error)) }
  }
}

function menu() {
  return Menu.buildFromTemplate([
    { label: tr('管理パネルを開く'), click: () => openPanel() },
    { label: tr(state.visible ? '帯を隠す' : '帯を表示'), click: () => {
      state.visible = !state.visible
      pointer(true)
      applyStripVisibility()
      publish()
    } },
    { label: tr(state.paused ? '再開' : '一時停止'), enabled: !state.storageError, click: () => { if (state.storageError || quitting || handlingQuit) return; state.paused = !state.paused; host.setPaused(state.paused); publish() } },
    { type: 'separator' },
    { label: tr('終了'), click: () => app.quit() },
  ])
}

/** The strip shows only when the user wants it AND no full-screen app is in front. */
function applyStripVisibility() {
  if (quitting) return
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
  const settings = commitSettings(state.settings, next, candidate => saveSettings(paths, candidate), publish)
  state.settings = settings
  if (next.locale) {
    setLocale(next.locale)
    // Committed settings remain successful even if a closing native window cannot update its title.
    try {
      if (panel && !panel.isDestroyed()) panel.setTitle(tr('タスクバー百鬼行'))
      if (!strip.isDestroyed()) strip.setTitle(tr('タスクバー百鬼行') + ' — ' + tr('帯'))
      if (tray && !tray.isDestroyed()) tray.setToolTip(tr('タスクバー百鬼行'))
    } catch (error) { log('locale notification failed: ' + String(error)) }
  }
  if (sizeChanged) placeStrip()
  if (next.autoStart !== undefined) applyAutoStart()
  if (next.hideOnFullscreen === false) fullscreenWatcher?.stop()
  if (next.hideOnFullscreen === true) fullscreenWatcher?.start()
  publish()
  return { ...state }
}

function start() {
  state.settings = loadSettings(paths, systemLocale(app.getLocale()))
  setLocale(state.settings.locale!)
  const loaded = loadProfile(paths)
  persistence = new PersistenceGuard(profile => saveProfile(paths, profile), error => {
    state.storageError = error ? `セーブを保存できないため一時停止しました。保存先の空き容量と書き込み権限を確認し、再試行またはセーブを書き出してください。\n${error}` : undefined
    storagePause.update(error)
    if (error) log(`save failed: ${error}`)
    publish()
    if (error && !handlingQuit) { try { openPanel() } catch (failure) { log('recovery panel failed: ' + String(failure)) } }
  }, error => reportError('保存状態を画面に通知できません', error))
  const sandbox = paths.profile === 'dev' && !app.isPackaged && process.env.GAME_STORE_SANDBOX === '1'
  commerce = new CommerceService({ path: sandbox ? paths.commerceSandbox : paths.commerce, profile: paths.profile, sandbox, packaged: app.isPackaged })
  state.appearance = commerce.getAppearance()
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
      if (!persistence.error) persistence.save(profile)
    },
    offline: () => tray?.displayBalloon({ title: tr('おかえりなさい'), content: tr('留守の間の報酬が届いています。管理パネルで受け取れます。') }),
  }, speed)
  cloud = new CloudClient(process.env.GAME_CLOUD_URL ?? (paths.profile === 'dev' ? DEVELOPMENT_CLOUD_ENDPOINT : undefined), {
    readProfile: () => ({ ...structuredClone(host.profile), savedAt: new Date().toISOString() }),
    restoreProfile: raw => {
      if (state.storageError || quitting || handlingQuit) throw new Error('Local save is unavailable; cloud restore was not applied')
      const profile = prepareCloudRestore(raw)
      const prepared = host.prepareProfile(profile)
      if (!persistence.save(prepared.profile)) throw new Error(persistence.error)
      host.replacePreparedProfile(prepared)
      state.paused = true
      publish()
    },
  })


  const display = screen.getPrimaryDisplay()
  const placed = stripLayout(display.workArea, display.scaleFactor, state.settings.size)
  layout = placed.layout
  strip = new BrowserWindow({ ...placed.bounds,
    title: tr('タスクバー百鬼行') + ' — ' + tr('帯'), frame: false, transparent: true, alwaysOnTop: true,
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
  tray.setToolTip(tr('タスクバー百鬼行'))
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
    if (quitting || handlingQuit) return { ok: false, reason: tr('終了処理中のため操作できません。') }
    if (state.storageError) return { ok: false, reason: '保存できないため操作を止めています。再試行またはセーブを書き出してください。' }
    const command = parseCommand(value)
    const result = command ? host.command(command) : { ok: false as const, reason: '不正な操作です' }
    return result.ok && state.storageError ? { ok: false, reason: state.storageError } : result
  })
  ipcMain.handle(channels.settings, (event, value: unknown) => {
    if (!fromPanel(event)) throw new Error('Unknown window')
    if (quitting || handlingQuit) { publish(); throw new Error(tr('終了処理中のため操作できません。')) }
    const settings = parseSettings(value)
    if (!settings) throw new Error('Invalid settings update')
    return applySettings(settings)
  })
  ipcMain.on(channels.openSaveFolder, (event) => { if (fromPanel(event)) void shell.openPath(dirname(paths.save)) })
  ipcMain.on(channels.exportSave, (event) => { if (fromPanel(event) && !quitting && !handlingQuit) exportCurrentSave() })
  ipcMain.handle(channels.retrySave, (event) => { if (!fromPanel(event)) throw new Error('Unknown window'); return !quitting && !handlingQuit && persistence.save(host.profile) })
  ipcMain.handle(channels.getStore, (event) => { if (!fromPanel(event)) throw new Error('Unknown window'); return commerce.getView() })
  ipcMain.handle(channels.getCloud, event => { if (!fromPanel(event)) throw new Error('Unknown window'); return cloud.view() })
  ipcMain.handle(channels.cloudCommand, (event, value: unknown) => {
    if (!fromPanel(event)) throw new Error('Unknown window')
    if (quitting || handlingQuit) throw new Error('Game is shutting down')
    return cloud.execute(parseCloudCommand(value))
  })
  ipcMain.handle(channels.purchase, async (event, sku: unknown) => {
    if (!fromPanel(event)) throw new Error('Unknown window')
    if (quitting || handlingQuit) return { ok: false, reason: tr('終了処理中のため操作できません。'), view: commerce.getView() }
    const result = await commerce.purchase(typeof sku === 'string' && sku.length < 64 ? sku : '')
    state.appearance = commerce.getAppearance(); publish()
    return result
  })
  ipcMain.handle(channels.equipCosmetic, (event, sku: unknown) => {
    if (!fromPanel(event)) throw new Error('Unknown window')
    if (quitting || handlingQuit) return { ok: false, reason: tr('終了処理中のため操作できません。'), view: commerce.getView() }
    const result = commerce.equip(sku === null ? null : typeof sku === 'string' && sku.length < 64 ? sku : '')
    if (previewTimer) clearTimeout(previewTimer)
    state.appearance = commerce.getAppearance(); publish()
    return result
  })
  ipcMain.handle(channels.previewCosmetic, (event, sku: unknown) => {
    if (!fromPanel(event)) throw new Error('Unknown window')
    if (quitting || handlingQuit) return false
    const product = typeof sku === 'string' && sku.length < 64 ? findProduct(sku) : undefined
    if (sku !== null && !product) return false
    if (previewTimer) clearTimeout(previewTimer)
    state.appearance = product?.theme ?? commerce.getAppearance(); publish()
    if (product) previewTimer = setTimeout(() => { state.appearance = commerce.getAppearance(); publish() }, 30000)
    return true
  })

  const probe = createProbe(log)
  state.fullscreenSupported = probe !== null
  if (probe) {
    fullscreenWatcher = new FullscreenWatcher(probe, () => {
      const rect = screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds)
      return { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height }
    }, (hidden) => { state.fullscreenHidden = hidden; applyStripVisibility(); publish() }, log, error => {
      state.fullscreenSupported = false
      publish()
      reportError('全画面の監視を続けられません', error)
    })
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

function exportCurrentSave() {
  try {
    const destination = dialog.showSaveDialogSync({ title: tr('セーブを書き出す'), defaultPath: 'hyakkiko-save.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!destination) return false
    if (isProtectedExport(destination, [paths.save, paths.previousSave, paths.brokenSave, paths.settings, paths.commerce, paths.commerceSandbox])) throw new Error(tr('保存ファイルや設定を上書きしない別名を指定してください。'))
    writeAtomic(destination, JSON.stringify({ ...host.profile, savedAt: new Date().toISOString() }, null, 2))
    return true
  } catch (error) {
    reportError('セーブを書き出せません', error)
    return false
  }
}

app.on('before-quit', (event) => {
  if (quitting) return
  // Stop an unexpected exception or a reentrant quit from closing an unsaved game.
  event.preventDefault()
  if (handlingQuit) return
  handlingQuit = true
  try {
    const approved = confirmSavedQuit({
      stop: () => host?.stop(), save: () => !host || persistence.save(host.profile),
      choose: () => dialog.showMessageBoxSync({ type: 'warning', title: tr('セーブを保存できません'), message: tr('未保存の進行があります。'), detail: tr('保存先を確認して再試行するか、別の場所へ書き出してください。保存せず終了すると、この起動中の未保存分は失われます。'), buttons: ['ゲームへ戻る', 'セーブを書き出す', '保存せず終了'].map(tr), defaultId: 0, cancelId: 0, noLink: true }),
      export: () => { exportCurrentSave() },
      restart: () => { host?.start(); if (state.storageError) openPanel() },
    })
    if (!approved) return
    quitting = true
    try {
      if (viewTimer) { clearTimeout(viewTimer); viewTimer = undefined }
      if (previewTimer) clearTimeout(previewTimer)
      fullscreenWatcher?.stop()
      tray?.destroy()
    } finally {
      // A cleanup failure must not strand an already-saved, stopped game.
      // The approved flag prevents another write or prompt on the second quit event.
      setImmediate(() => app.quit())
    }
  } catch (error) { log('quit was cancelled: ' + String(error)) }
  finally { handlingQuit = false }
})
// Closing the panel only hides it; the tray owns the lifetime.
app.on('window-all-closed', () => { if (quitting) app.quit() })
