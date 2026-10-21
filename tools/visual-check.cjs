// Local visual check: runs the built app (dev profile) and captures ONLY the game's own windows with
// webContents.capturePage, so nothing else on the desktop is recorded. Ends through the real tray "終了".
//   pnpm build && node tools/shell-check.mjs --visual     (env: VISUAL_SECONDS, VISUAL_SHOTS, GAME_SPEED)
const electron = require('electron')
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
  const { width, height } = strip.getBounds()
  for (let index = 0; index < shots; index++) {
    await wait(seconds * 1000 / shots)
    const left = await strip.webContents.capturePage({ x: 0, y: 0, width: Math.min(width, 900), height })
    const right = await strip.webContents.capturePage({ x: width - 300, y: 0, width: 300, height })
    writeFileSync(resolve(out, `strip-${index}.png`), left.toPNG()); writeFileSync(resolve(out, `strip-hud-${index}.png`), right.toPNG())
  }
  select('管理パネルを開く')
  await wait(2500)
  const panel = electron.BrowserWindow.getAllWindows().find((win) => win !== strip)
  const tabs = await panel.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].map((button) => button.textContent)`)
  for (let index = 0; index < tabs.length; index++) {
    await panel.webContents.executeJavaScript(`document.querySelectorAll('nav button')[${index}].click()`)
    await wait(500)
    writeFileSync(resolve(out, `panel-${index}.png`), (await panel.webContents.capturePage()).toPNG())
  }
  console.log(`VISUAL OK: ${shots} strip shots, panel tabs ${tabs.join('/')} → ${out}`)
  select('終了')
})
