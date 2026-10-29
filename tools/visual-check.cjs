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
  assert.equal(await strip.webContents.executeJavaScript(`document.documentElement.dataset.artSheets`), '29', 'all character and monster art decoded')
  assert.equal(await strip.webContents.executeJavaScript(`document.querySelector('#screen').dataset.party.split(',').length`), 3, 'only three allies are rendered')
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
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelectorAll('.card .sprite').length`), 17, 'all companion portraits rendered without battle sheets')
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelectorAll('.deployed-cards .card').length`), 3)
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelectorAll('.reserve-cards .card').length`), 14)
  assert.equal(await panel.webContents.executeJavaScript(`getComputedStyle(document.querySelector('h1')).fontFamily.includes('BIZ UDPGothic') && document.fonts.check('700 16px "BIZ UDPGothic"')`), true)
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
  await panel.webContents.executeJavaScript(`document.querySelector('nav button').click()`)
  await wait(300)
  const originalOrder = await panel.webContents.executeJavaScript(`window.game.getView().then(v => v.party.map(m => m.job))`)
  const swapped = await panel.webContents.executeJavaScript(`(async () => {
    const v = await window.game.getView(), candidate = v.party.find(m => !m.active && m.job === 'sister');
    const selector = document.querySelector('.deployed-cards .party-swap');
    selector.value = candidate.job; selector.dispatchEvent(new Event('change', { bubbles: true }));
    return candidate.job;
  })()`)
  await wait(500)
  assert.equal(await panel.webContents.executeJavaScript(`window.game.getView().then(v => v.party.filter(m => m.active).some(m => m.job === ${JSON.stringify(swapped)}))`), true, 'swap through actual select control')
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelectorAll('.deployed-cards .card').length`), 3)
  writeFileSync(resolve(out, 'panel-swapped.png'), (await panel.webContents.capturePage()).toPNG())
  await panel.webContents.executeJavaScript(`window.game.command({ c: 'reorderParty', order: ${JSON.stringify(originalOrder)} })`)
  await wait(500)
  await panel.webContents.executeJavaScript(`document.querySelectorAll('.role-filters button')[3].click()`)
  await wait(100)
  const filtered = await panel.webContents.executeJavaScript(`(async () => ({ shown: document.querySelectorAll('.reserve-cards .card').length, expected: (await window.game.getView()).party.filter(m => !m.active && m.roleId === 'healer').length }))()`)
  assert.equal(filtered.shown, filtered.expected, 'role filter shows only healers')
  await panel.webContents.executeJavaScript(`document.querySelector('.role-filters button').click()`)
  panel.setSize(640, 540)
  await panel.webContents.executeJavaScript(`document.querySelector('nav button').click()`)
  await wait(500)
  assert.equal(await panel.webContents.executeJavaScript(`document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth`), true, 'compact panel must not overflow')
  writeFileSync(resolve(out, 'panel-compact.png'), (await panel.webContents.capturePage()).toPNG())
  // Preview all production characters from the actual decoded in-game portraits. No desktop content is captured.
  select('一時停止'); await wait(600)
  panel.setSize(1100, 960)
  await panel.webContents.executeJavaScript(`(async () => {
    const v = await window.game.getView();
    const cards = v.party.map(m => {
      const image = document.querySelector('[data-job="' + m.job + '"] .sprite').toDataURL();
      return '<article><img src="' + image + '"><b>' + m.name + '</b><span>' + m.role + '</span></article>';
    }).join('');
    const style = document.createElement('style'); style.textContent = '.gallery{padding:24px;background:#171822;height:100vh;overflow:auto;font-family:Meiryo,sans-serif}.gallery h1{font-size:23px;margin:0 0 6px}.gallery p{color:#aaa;font-size:12px;margin:0 0 18px}.gallery-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.gallery article{background:#242532;border:1px solid #414351;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px}.gallery img{width:108px;height:90px;object-fit:contain;image-rendering:pixelated}.gallery b{font-size:14px}.gallery span{font-size:11px;color:#b7b1c1}'; document.head.append(style);
    document.querySelector('#app').innerHTML = '<div class="gallery"><h1>タスクバー百鬼行 — 全17ジョブ</h1><p>17ジョブから3人を編成。ゲーム内で使用しているキャラクター画像です。</p><div class="gallery-grid">' + cards + '</div></div>';
  })()`)
  await wait(200)
  writeFileSync(resolve(out, 'roster.png'), (await panel.webContents.capturePage()).toPNG())
  console.log(`VISUAL OK: ${shots} strip shots, panel tabs ${tabs.join('/')} → ${out}`)
  select('終了')
})
