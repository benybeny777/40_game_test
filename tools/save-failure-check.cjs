// Real Electron IPC/renderer/storage checks. Only native save/quit dialogs are stubbed.
const electron = require('electron')
const assert = require('node:assert/strict')
const { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync } = require('node:fs')
const { dirname, isAbsolute, relative, resolve } = require('node:path')
const { setTimeout, clearTimeout } = require('node:timers')

const lab = resolve(process.env.GAME_DATA_DIR || '')
const paths = JSON.parse(process.env.GAME_SAVE_CHECK_PATHS || '{}')
const nonce = process.env.GAME_SAVE_CHECK_NONCE
assert.ok(isAbsolute(lab) && /save-failure-\d+-[a-f0-9]+$/.test(lab) && nonce, 'must use an exclusive save-failure lab')
assert.equal(process.env.GAME_PROFILE, 'dev')
assert.equal(JSON.parse(readFileSync(resolve(lab, '.owner.json'), 'utf8')).nonce, nonce)
const within = target => { const part = relative(lab, resolve(target)); assert.ok(part && !part.startsWith('..') && !isAbsolute(part), 'target must remain inside the owned lab'); return resolve(target) }
for (const key of ['save', 'settings']) within(paths[key])
const wait = ms => new Promise(done => setTimeout(done, ms))
const until = async (check, label) => { for (let trial = 0; trial < 100; trial++) { if (await check()) return; await wait(50) } throw new Error('Timed out: ' + label) }
const createdDirectories = new Set()
function faultDirectory(target) {
  target = within(target)
  assert.equal(existsSync(target), false, 'fault injection must not replace any existing file')
  mkdirSync(dirname(target), { recursive: true }); mkdirSync(target); createdDirectories.add(target)
}
function removeFaultDirectory(target) {
  target = within(target)
  assert.ok(createdDirectories.has(target), 'only an empty directory created by this test can be removed')
  assert.ok(lstatSync(target).isDirectory() && !lstatSync(target).isSymbolicLink())
  assert.equal(readdirSync(target).length, 0)
  rmdirSync(target) // Deliberately non-recursive.
  createdDirectories.delete(target)
}

const dialogChoices = [], dialogs = [], saveExports = [], checks = []
let beforeQuitEvents = 0, complete = false
const saveExport = resolve(lab, 'exports', 'quit-choice-1.json')
electron.dialog.showMessageBoxSync = options => {
  assert.ok(dialogChoices.length, 'unexpected native message dialog')
  const choice = dialogChoices.shift(); dialogs.push({ choice, title: options.title, buttons: options.buttons })
  return choice
}
electron.dialog.showSaveDialogSync = () => { saveExports.push(saveExport); return saveExport }
electron.dialog.showErrorBox = (title, content) => { throw new Error('Unexpected error dialog: ' + title + ': ' + content) }
electron.app.on('before-quit', () => { beforeQuitEvents++ })
process.on('uncaughtException', error => { console.error(error); electron.app.exit(1) })
process.on('unhandledRejection', error => { console.error(error); electron.app.exit(1) })
const watchdog = setTimeout(() => { console.error('save-failure verification timed out'); electron.app.exit(1) }, 30000)
watchdog.unref()
const { getTrayMenu } = require(resolve(__dirname, '../out/main/index.js'))
const select = labels => {
  const item = getTrayMenu().items.find(entry => labels.includes(entry.label))
  assert.ok(item, labels.join(' / ')); assert.notEqual(item.enabled, false)
  item.click()
}

electron.app.on('will-quit', () => {
  try {
    assert.equal(complete, true, 'quit was not approved by the final test step')
    assert.deepEqual(dialogs.map(entry => entry.choice), [0, 1, 2])
    assert.equal(dialogChoices.length, 0)
    assert.equal(beforeQuitEvents, 4, 'three attempts and exactly one approved re-entry')
    clearTimeout(watchdog)
    console.log('SAVE_FAILURE_PASS ' + JSON.stringify({ checks, dialogs: dialogs.map(entry => ({ choice: entry.choice, title: entry.title })), beforeQuitEvents,
      nativeDialogs: 'stubbed; not real mouse interaction', data: lab }))
  } catch (error) { console.error(error); electron.app.exit(1) }
})
electron.app.whenReady().then(async () => {
  await until(() => !!getTrayMenu(), 'main startup')
  select(['管理パネルを開く', 'Open management panel'])
  const panel = electron.BrowserWindow.getAllWindows().find(win => win.getBounds().height >= 420)
  assert.ok(panel, 'real management BrowserWindow')
  await until(() => !panel.webContents.isLoading(), 'panel loaded')
  await until(() => panel.isVisible(), 'native panel visible')
  const js = code => panel.webContents.executeJavaScript(code)
  // Deliberately start before artwork resolves: an old initial snapshot must not overwrite the live error state.
  await until(() => js('!!document.querySelector("nav button")'), 'renderer subscribed')
  assert.equal(electron.app.getPath('userData'), lab)
  const state = () => js('window.game.getState()')
  const playMs = () => js('window.game.getView().then(view => view.stats.playMs)')
  const retry = () => js('window.game.retrySave()')
  const command = loop => js('window.game.command({ c: "setLoop", loop: ' + loop + ' })')

  faultDirectory(paths.save)
  assert.equal((await command(true)).ok, false)
  await until(async () => !!(await state()).storageError, 'save error published')
  assert.equal((await state()).paused, true)
  await until(() => js('(() => { const alert = document.querySelector(".storage-error[role=alert]"); return !!alert && alert.getBoundingClientRect().height > 0 })()'), 'save alert rendered')
  const alert = await js('(() => { const alert = document.querySelector(".storage-error[role=alert]"); return { shown: !!alert && alert.getBoundingClientRect().height > 0 && getComputedStyle(alert).display !== "none" && getComputedStyle(alert).visibility !== "hidden", text: alert?.textContent, buttons: [...(alert?.querySelectorAll("button") ?? [])].map(button => button.textContent) } })()')
  assert.equal(alert.shown, true)
  await until(() => js('!!document.querySelector(".card") && !!document.querySelector(".storage-error")'), 'initial artwork preserves live save alert')
  assert.ok(alert.buttons.includes('保存を再試行') && alert.buttons.includes('セーブを書き出す'))
  assert.equal(await retry(), false)
  assert.equal((await state()).paused, true)
  removeFaultDirectory(paths.save)
  assert.equal(await retry(), true)
  assert.equal((await state()).storageError, undefined)
  assert.equal((await state()).paused, false)
  assert.equal(JSON.parse(readFileSync(paths.save, 'utf8')).version, 3)
  await until(() => js('!document.querySelector(".storage-error")'), 'alert cleared')
  checks.push('real save directory-as-file fault -> IPC failure -> paused + alert/retry/export -> successful retry -> running')

  select(['一時停止', 'Pause'])
  faultDirectory(paths.save + '.tmp')
  assert.equal((await command(false)).ok, false)
  removeFaultDirectory(paths.save + '.tmp')
  assert.equal(await retry(), true)
  assert.equal((await state()).paused, true, 'manual pause must survive storage recovery')
  select(['再開', 'Resume'])
  const active = await playMs(); await wait(300); assert.ok(await playMs() > active)
  checks.push('retry preserves pre-existing manual pause; explicit resume advances real host')

  faultDirectory(paths.settings)
  const optimistic = await js('(() => { window.__saveCheckStates = []; window.game.onState(state => window.__saveCheckStates.push(state.settings.locale)); document.querySelector("[data-focus-key=nav-settings]").click(); const select = document.querySelector("select[aria-label*=Language]"); select.value = "en"; select.dispatchEvent(new Event("change")); return document.documentElement.lang })()')
  assert.equal(optimistic, 'en')
  await until(() => js('document.documentElement.lang === "ja" && window.__saveCheckStates.includes("ja")'), 'failed locale restored in UI')
  assert.equal((await state()).settings.locale, 'ja')
  assert.equal((await state()).storageError, undefined)
  removeFaultDirectory(paths.settings)
  await js('(() => { const select = document.querySelector("select[aria-label*=Language]"); select.value = "en"; select.dispatchEvent(new Event("change")); })()')
  await until(async () => (await state()).settings.locale === 'en', 'locale saved')
  assert.equal(await js('document.documentElement.lang'), 'en')
  assert.equal(JSON.parse(readFileSync(paths.settings, 'utf8')).locale, 'en')
  checks.push('real settings directory-as-file fault rolls optimistic locale back; retry persists English')

  const failQuitAndRecover = async choice => {
    faultDirectory(paths.save + '.tmp')
    dialogChoices.push(choice)
    electron.app.quit()
    await until(async () => !!(await state()).storageError, 'quit error remains visible')
    assert.equal((await state()).paused, true)
    assert.equal(dialogs.at(-1).choice, choice)
    removeFaultDirectory(paths.save + '.tmp')
    assert.equal(await retry(), true)
    assert.equal((await state()).paused, false)
    const before = await playMs(); await wait(300); assert.ok(await playMs() > before, 'host timer must restart after prevented quit')
  }
  await failQuitAndRecover(0)
  checks.push('stubbed quit choice 0: cancel exit -> retry -> live host timer restored')
  await wait(200)
  await failQuitAndRecover(1)
  assert.equal(saveExports.length, 1)
  const exported = JSON.parse(readFileSync(saveExport, 'utf8'))
  assert.equal(exported.version, 3); assert.equal(exported.party.order.length, 17)
  checks.push('stubbed quit choice 1: current save exported; exit cancelled; timer restored after retry')

  faultDirectory(paths.save + '.tmp')
  checks.push('stubbed quit choice 2: explicit discard exits; exactly one approved quit re-entry')
  dialogChoices.push(2); complete = true
  electron.app.quit()
}).catch(error => { console.error(error); electron.app.exit(1) })
