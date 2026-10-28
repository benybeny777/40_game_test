// Tests actual Windows foreground fullscreen detection using only a disposable game-owned window.
const electron = require('electron')
const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { getTrayMenu, createProbe } = require(resolve(__dirname, '../out/main/index.js'))
const wait = ms => new Promise(done => setTimeout(done, ms))
const select = label => getTrayMenu().items.find(item => item.label === label).click()
process.on('unhandledRejection', error => { console.error(error); electron.app.exit(1) })
const manualFocus = process.env.GAME_FULLSCREEN_MANUAL === '1'
setTimeout(() => { console.error('fullscreen check timed out'); electron.app.exit(1) }, manualFocus ? 90000 : 30000).unref()
electron.app.whenReady().then(async () => {
  await wait(2000)
  const strip = electron.BrowserWindow.getAllWindows()[0]
  select('管理パネルを開く'); await wait(1200)
  const panel = electron.BrowserWindow.getAllWindows().find(win => win !== strip)
  const getState = () => panel.webContents.executeJavaScript('window.game.getState()')
  assert.equal((await getState()).fullscreenSupported, true, 'real Windows probe must load')
  await panel.webContents.executeJavaScript('window.game.updateSettings({ hideOnFullscreen: true })')
  panel.hide()
  const fixture = new electron.BrowserWindow({ width: 640, height: 480, title: '百鬼行 全画面検証', webPreferences: { sandbox: true } })
  await fixture.loadURL('about:blank')
  const nativeHandle = fixture.getNativeWindowHandle()
  const fixtureId = String(nativeHandle.length === 8 ? nativeHandle.readBigUInt64LE() : nativeHandle.readUInt32LE())
  const awaitFocus = async (stage) => {
    if (!manualFocus) return
    console.log(`MANUAL FOCUS ${stage}: activate only the disposable 百鬼行 全画面検証 window`)
    const until = Date.now() + 25000
    while (createProbe(console.log)().windowId !== fixtureId && Date.now() < until) await wait(250)
    if (createProbe(console.log)().windowId !== fixtureId) throw new Error(`Foreground activation was not obtained: ${stage}`)
    await wait(2200)
  }
  fixture.setFullScreen(true); fixture.focus(); await awaitFocus('fullscreen'); await wait(3500)
  console.log('FULLSCREEN sample', createProbe(console.log)())
  assert.equal((await getState()).fullscreenHidden, true, 'fullscreen foreground hides strip')
  assert.equal(strip.isVisible(), false)
  fixture.setFullScreen(false); await wait(600)
  fixture.setBounds({ x: 100, y: 100, width: 640, height: 480 }); fixture.show(); fixture.focus(); await awaitFocus('windowed'); await wait(3500)
  console.log('WINDOWED sample', createProbe(console.log)())
  console.log('FIXTURE', { bounds: fixture.getBounds(), fullscreen: fixture.isFullScreen(), focused: fixture.isFocused() })
  if (createProbe(console.log)().windowId !== fixtureId) {
    console.log('FULLSCREEN PARTIAL: hiding confirmed; the Windows foreground is another window, restore requires direct operation')
    await panel.webContents.executeJavaScript('window.game.updateSettings({ hideOnFullscreen: false })')
    assert.equal(strip.isVisible(), true, 'disabling fullscreen detection restores strip')
    fixture.destroy(); select('終了'); return
  }
  assert.equal((await getState()).fullscreenHidden, false, 'leaving fullscreen restores strip')
  assert.equal(strip.isVisible(), true)
  fixture.destroy()
  console.log('FULLSCREEN PASS: native fullscreen hides strip, leaving restores it')
  select('終了')
})
