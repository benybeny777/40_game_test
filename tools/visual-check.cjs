// Local visual check: runs the built app (dev profile) and captures ONLY the game's own windows with
// webContents.capturePage, so nothing else on the desktop is recorded. Ends through the real tray "終了".
//   pnpm build && node tools/shell-check.mjs --visual     (env: VISUAL_SECONDS, VISUAL_SHOTS, GAME_SPEED)
const electron = require('electron')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { getTrayMenu } = require(resolve(__dirname, '../out/main/index.js'))

const out = resolve(__dirname, '../.dev-data/preview')
const seconds = Number(process.env.VISUAL_SECONDS || 20), shots = Number(process.env.VISUAL_SHOTS || 4)
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const select = (label) => { const item = getTrayMenu().items.find((entry) => entry.label === label); if (!item) throw new Error(label); item.click() }
process.on('unhandledRejection', (error) => { console.error(error); electron.app.exit(1) })
setTimeout(() => { console.error('visual check timed out'); electron.app.exit(1) }, (seconds + 60) * 1000).unref()

electron.app.whenReady().then(async () => {
  mkdirSync(out, { recursive: true })
  await wait(3000)
  const [strip] = electron.BrowserWindow.getAllWindows()
  select('管理パネルを開く')
  await wait(1200)
  const setupPanel = electron.BrowserWindow.getAllWindows().find((win) => win !== strip)
  await setupPanel.webContents.executeJavaScript(`window.game.updateSettings({ hideOnFullscreen: false })`)
  setupPanel.hide()
  await wait(500)
  assert.equal(strip.isVisible(), true, 'strip must be visible when capturing')
  assert.equal(await strip.webContents.executeJavaScript(`document.documentElement.dataset.artSheets`), '17', 'all character and monster art decoded')
  const pixels = await strip.webContents.executeJavaScript(`(() => { const c = document.querySelector('#screen'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]) n++; return n })()`)
  assert.ok(pixels > 1000, `strip must draw the game, found ${pixels} visible pixels`)
  const { width, height } = strip.getBounds()
  for (let index = 0; index < shots; index++) {
    await wait(seconds * 1000 / shots)
    const left = await strip.webContents.capturePage({ x: 0, y: 0, width: Math.min(width, 1200), height })
    const right = await strip.webContents.capturePage({ x: width - 300, y: 0, width: 300, height })
    writeFileSync(resolve(out, `strip-${index}.png`), left.toPNG()); writeFileSync(resolve(out, `strip-hud-${index}.png`), right.toPNG())
  }
  select('管理パネルを開く')
  await wait(2500)
  const panel = electron.BrowserWindow.getAllWindows().find((win) => win !== strip)
  await panel.webContents.executeJavaScript(`document.querySelector('.modal .buy')?.click()`)   // おかえり報酬を受け取る
  await wait(800)
  assert.equal(await panel.webContents.executeJavaScript(`document.documentElement.dataset.artSheets`), '17')
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelectorAll('.cards .card').length`), 5)
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth`), true, 'panel must not overflow horizontally')
  const tabs = await panel.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].map((button) => button.textContent)`)
  for (let index = 0; index < tabs.length; index++) {
    await panel.webContents.executeJavaScript(`document.querySelectorAll('nav button')[${index}].click()`)
    await wait(500)
    writeFileSync(resolve(out, `panel-${index}.png`), (await panel.webContents.capturePage()).toPNG())
  }
  // Exercise actual renderer -> preload -> main -> core commands, using the verification save only.
  const interaction = await panel.webContents.executeJavaScript(`(async () => {
    const before = await window.game.getView();
    const order = before.party.map(m => m.job).reverse();
    const reordered = await window.game.command({ c: 'reorderParty', order });
    const after = await window.game.getView();
    await window.game.command({ c: 'reorderParty', order: before.party.map(m => m.job) });
    const options = await window.game.command({ c: 'setOptions', autoEquip: !before.options.autoEquip });
    const changed = await window.game.getView();
    await window.game.command({ c: 'setOptions', autoEquip: before.options.autoEquip });
    return { reordered: reordered.ok && after.party.map(m => m.job).join() === order.join(), options: options.ok && changed.options.autoEquip !== before.options.autoEquip };
  })()`)
  assert.deepEqual(interaction, { reordered: true, options: true })
  panel.setSize(640, 540)
  await panel.webContents.executeJavaScript(`document.querySelector('nav button').click()`)
  await wait(500)
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth`), true, 'compact panel must not overflow')
  writeFileSync(resolve(out, 'panel-compact.png'), (await panel.webContents.capturePage()).toPNG())
  console.log(`VISUAL OK: ${shots} strip shots, panel tabs ${tabs.join('/')} → ${out}`)
  select('終了')
})
