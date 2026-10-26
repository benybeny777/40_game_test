// Interactive local verification. Uses real Electron Tray/BrowserWindow objects.
// Does not expose an IPC/debug server or change production startup.
const electron = require('electron')
const { resolve } = require('node:path')
const verify = process.argv.includes('--verify') || process.env.GAME_M0_VERIFY === '1'
process.on('uncaughtException', (error) => { console.error(error); electron.app.exit(1) })
process.on('unhandledRejection', (error) => { console.error(error); electron.app.exit(1) })
if (verify) setTimeout(() => { console.error('M0 verification timed out'); electron.app.exit(1) }, 15000).unref()
if (process.argv.includes('--fixture')) {
  const { resolvePaths } = require('../src/main/paths.ts')
  const paths = resolvePaths(resolve(__dirname, '..'), electron.app.getPath('userData'), 'dev')
  electron.app.setPath('userData', paths.verification)
  electron.app.whenReady().then(() => {
    const fixture = new electron.BrowserWindow({ title: 'M0 クリック透過の確認', show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    fixture.once('ready-to-show', () => { fixture.maximize(); fixture.show() })
    fixture.loadFile(resolve(__dirname, 'click-through.html'))
  })
  electron.app.on('window-all-closed', () => electron.app.quit())
} else {
  const { getTrayMenu } = require(resolve(__dirname, '../out/main/index.js'))
  electron.app.whenReady().then(() => setTimeout(async () => {
    if (verify) {
      getTrayMenu().items.find(item => item.label === '管理パネルを開く').click()
      const setup = electron.BrowserWindow.getAllWindows().find(win => win.getTitle() !== 'タスクバー百鬼行 — 帯')
      if (setup.webContents.isLoading()) await new Promise(done => setup.webContents.once('did-finish-load', done))
      await setup.webContents.executeJavaScript('window.game.updateSettings({ hideOnFullscreen: false })')
      setup.hide()
    }
    console.log(JSON.stringify(electron.BrowserWindow.getAllWindows().map((win) => ({
    id: win.id, title: win.getTitle(), visible: win.isVisible(), bounds: win.getBounds(),
    top: win.isAlwaysOnTop(), focusable: win.isFocusable(),
    }))))
    if (verify || process.argv.includes('--menu')) {
      const assert = require('node:assert/strict')
      const select = (label) => {
        const item = getTrayMenu().items.find((item) => item.label === label)
        assert.ok(item, label)
        item.click()
      }
      const strip = electron.BrowserWindow.getAllWindows().find(win => win.getTitle() === 'タスクバー百鬼行 — 帯')
      assert.equal(strip.isAlwaysOnTop(), true)
      select('帯を隠す'); assert.equal(strip.isVisible(), false)
      select('帯を表示'); assert.equal(strip.isVisible(), true)
      select('一時停止'); assert.ok(getTrayMenu().items.some((item) => item.label === '再開'))
      select('再開'); select('管理パネルを開く')
      const panel = electron.BrowserWindow.getAllWindows().find((win) => win !== strip)
      const checkPanel = async () => {
        assert.equal(await panel.webContents.executeJavaScript('getComputedStyle(document.body).margin'), '0px')
        panel.close(); assert.equal(panel.isVisible(), false)
        select('管理パネルを開く'); assert.equal(panel.isVisible(), true)
        if (process.argv.includes('--menu')) {
          setTimeout(() => getTrayMenu().popup({ window: panel, x: 60, y: 90 }), 500)
          return
        }
        console.log('M0 PASS: real tray menu show/hide/pause/resume/panel; normal quit follows')
        select('終了')
      }
      if (panel.webContents.isLoading()) panel.webContents.once('did-finish-load', checkPanel)
      else void checkPanel()
    }
  }, 2000))
}
