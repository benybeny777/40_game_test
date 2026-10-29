// Acceptance of the real packaged executable. Never loads source main or launches the development Electron runtime.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('node tools/packaged-check.mjs [--minutes 0.25] [--label intermediate|final]')
  console.log('Runs the actual Windows executable, then restarts it. No publication or live purchase. Results: .dev-data/packaged-acceptance/<run>/report.json')
  process.exit(0)
}
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const minutes = Number(option('--minutes', '0.25'))
const label = option('--label', 'intermediate')
if (!Number.isFinite(minutes) || minutes < 0.1 || minutes > 1440 || !['intermediate', 'final'].includes(label)) throw new Error('Use --minutes 0.1..1440 and --label intermediate|final')
if (process.platform !== 'win32') throw new Error('This acceptance launcher requires Windows')
const base = resolve(root, '.dev-data/packaged-acceptance')
const runDir = resolve(base, new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + process.pid)
if (!runDir.startsWith(base + '\\')) throw new Error('Unexpected acceptance data path')
const dataDir = join(runDir, 'data'), exe = join(root, 'release/win-unpacked/TaskbarHyakkiko.exe')
if (!existsSync(exe)) throw new Error('Run pnpm dist first; the real packaged executable is missing')
mkdirSync(dataDir, { recursive: true })
const report = { label, startedAt: new Date().toISOString(), requestedMinutes: minutes, exe, dataDir, phases: [],
  limitations: ['Not a clean-machine check; developer tools are installed on this PC.', 'Native tray pause/menu interaction, fullscreen/DPI compatibility, suspend/resume and signing require separate checks.', 'CDP attaches only to this launched game. Source main is never required.', 'Default label is intermediate; later source changes require a fresh build and rerun.'], errors: [] }
const hash = createHash('sha256')
for await (const bytes of createReadStream(exe)) hash.update(bytes)
report.exeSha256 = hash.digest('hex')
const archiveHash = createHash('sha256')
for await (const bytes of createReadStream(join(dirname(exe), 'resources/app.asar'))) archiveHash.update(bytes)
report.asarSha256 = archiveHash.digest('hex')

function assert(condition, message) { if (!condition) throw new Error(message) }
async function freePort() {
  const server = createServer()
  await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res) })
  const port = server.address().port
  await new Promise(res => server.close(res))
  return port
}
async function until(callback, timeout = 10000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try { const value = await callback(); if (value) return value } catch (error) { last = error }
    await delay(150)
  }
  throw new Error(`Timed out${last ? ': ' + last.message : ''}`)
}
async function portClosed(port) {
  try { await globalThis.fetch(`http://127.0.0.1:${port}/json/list`, { signal: globalThis.AbortSignal.timeout(750) }); return false } catch { return true }
}
async function target(port, page) {
  const pages = await (await globalThis.fetch(`http://127.0.0.1:${port}/json/list`, { signal: globalThis.AbortSignal.timeout(1500) })).json()
  return pages.find(entry => entry.type === 'page' && entry.url.startsWith('file:') && entry.url.replaceAll('\\', '/').endsWith(`/out/renderer/${page}/index.html`))
}
class CDP {
  requests = new Map()
  seq = 0
  errors = []
  async connect(url) {
    const address = new globalThis.URL(url)
    assert(['127.0.0.1', 'localhost'].includes(address.hostname), 'Refusing a non-local debugger')
    this.ws = new globalThis.WebSocket(url)
    await new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', () => rej(new Error('CDP connection failed')), { once: true }) })
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails)
      if (message.method === 'Inspector.targetCrashed') this.errors.push({ text: 'Renderer crashed' })
      if (!message.id) return
      const pending = this.requests.get(message.id)
      if (!pending) return
      globalThis.clearTimeout(pending.timer); this.requests.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result)
    })
    this.ws.addEventListener('close', () => { for (const pending of this.requests.values()) { globalThis.clearTimeout(pending.timer); pending.reject(new Error('CDP closed')) }; this.requests.clear() })
    await this.send('Runtime.enable')
    await this.send('Page.enable')
    return this
  }
  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => { this.requests.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
      this.requests.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  async capture(path) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(path, Buffer.from(shot.data, 'base64'))
  }
  close() { this.ws?.close() }
}

async function powershell(script) {
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', error = ''
  child.stdout.on('data', data => { output += data }); child.stderr.on('data', data => { error += data })
  const timer = globalThis.setTimeout(() => child.kill(), 10000)
  try {
    const code = await new Promise((res, rej) => { child.once('exit', res); child.once('error', rej) })
    if (code !== 0) throw new Error(`Process sampling failed: ${error.slice(-1000)}`)
    return output.trim() ? JSON.parse(output) : []
  } finally { globalThis.clearTimeout(timer) }
}
async function processSample(pid) {
  const script = `$all = @(Get-CimInstance Win32_Process); $ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${pid}); do { $added = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added = $true } } } while ($added); @($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { [pscustomobject]@{ pid=$p.Id; parent=$_.ParentProcessId; name=$p.ProcessName; cpuMs=$p.TotalProcessorTime.TotalMilliseconds; workingSet=$p.WorkingSet64; privateBytes=$p.PrivateMemorySize64; handles=$p.HandleCount } } }) | ConvertTo-Json -Compress`
  const data = await powershell(script)
  const processes = Array.isArray(data) ? data : [data]
  return { at: new Date().toISOString(), processes, workingSet: processes.reduce((sum, p) => sum + p.workingSet, 0), privateBytes: processes.reduce((sum, p) => sum + p.privateBytes, 0), cpuMs: processes.reduce((sum, p) => sum + p.cpuMs, 0) }
}
async function phase(name, durationMs, restart) {
  const port = await freePort(), started = Date.now()
  const phase = { name, debuggerPort: port, requestedRunMs: durationMs, startedAt: new Date().toISOString(), checks: [], samples: [], rendererErrors: [] }
  report.phases.push(phase)
  const env = { ...process.env, GAME_PROFILE: 'user', GAME_DATA_DIR: dataDir, GAME_STORE_SANDBOX: '1', GAME_SMOKE_QUIT_MS: String(durationMs + 20000) }
  for (const key of ['GAME_SPEED', 'ELECTRON_RENDERER_URL', 'ELECTRON_RUN_AS_NODE']) delete env[key]
  phase.environment = { GAME_PROFILE: env.GAME_PROFILE, GAME_DATA_DIR: env.GAME_DATA_DIR, GAME_STORE_SANDBOX: '1', GAME_SMOKE_QUIT_MS: env.GAME_SMOKE_QUIT_MS, GAME_SPEED: 'unset' }
  const child = spawn(exe, ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`], { cwd: dirname(exe), env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = '', exit
  child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
  const exited = new Promise((res, rej) => { child.once('exit', (code, signal) => { exit = { code, signal }; res(exit) }); child.once('error', rej) })
  phase.pid = child.pid
  let strip, panel
  try {
    const stripTarget = await until(() => target(port, 'strip'), 15000)
    strip = await new CDP().connect(stripTarget.webSocketDebuggerUrl)
    await until(() => strip.evaluate('Boolean(window.game && Number(document.documentElement.dataset.artSheets) >= 29)'), 10000)
    await strip.evaluate('window.__acceptanceFrames = []; window.game.onFrame(f => { window.__acceptanceFrames.push({tick:f.snapshot.tick, phase:f.snapshot.phase, allies:f.snapshot.units.filter(u=>u.side==="ally").length}); if(window.__acceptanceFrames.length>100)window.__acceptanceFrames.shift() }); window.game.openPanel({tab:"party"}); true')
    const panelTarget = await until(() => target(port, 'panel'))
    panel = await new CDP().connect(panelTarget.webSocketDebuggerUrl)
    await until(() => panel.evaluate('Boolean(window.game && document.querySelector(".card"))'))
    const initial = await panel.evaluate('(async()=>({state:await window.game.getState(),view:await window.game.getView(),store:await window.game.getStore()}))()')
    assert(initial.state.packaged && initial.state.profile === 'user', 'Not the packaged user profile')
    assert(initial.state.paused === false && !initial.state.storageError && !initial.state.runtimeError, 'Unexpected initial paused/storage-error state')
    assert(initial.view.party.length === 17 && initial.view.party.filter(member => member.active).length === 3, 'Expected 17 members and 3 active')
    assert(initial.store.mode === 'unavailable' && initial.store.market.available === false, 'Packaged sandbox or Market unexpectedly enabled')
    // The desktop may currently contain an unrelated fullscreen app. Keep only this isolated test strip visible.
    await panel.evaluate('window.game.updateSettings({hideOnFullscreen:false})')
    await until(async () => (await strip.evaluate('window.__acceptanceFrames.length')) > 0, 10000)
    const purchase = await panel.evaluate('window.game.purchaseProduct("ground_sakura")')
    assert(purchase.ok === false && purchase.view.mode === 'unavailable', 'Packaged build accepted a sandbox purchase')
    phase.checks.push('real-packaged-user', '17-members-3-active', 'initial-not-paused', 'sandbox-env-rejected', 'purchase-rejected-market-disabled')
    if (restart) {
      assert(initial.view.dungeon.town && initial.view.stage.loop && initial.view.options.autoEquip === false, 'Saved town/options/loop did not restore')
      assert(initial.state.settings.locale === 'en', 'Saved language did not restore')
      phase.checks.push('restart-town-options-loop-language-restored')
    }
    for (const locale of ['en', 'ja']) {
      await panel.evaluate(`window.game.updateSettings({locale:${JSON.stringify(locale)}})`)
      await until(async () => {
        const state = await strip.evaluate('window.game.getState()')
        const text = await panel.evaluate('document.querySelector("nav")?.textContent ?? ""')
        return state.settings.locale === locale && text.includes(locale === 'en' ? 'Party' : 'パーティ')
      })
      await panel.capture(join(runDir, `${name}-panel-${locale}.png`))
    }
    phase.checks.push('en-ja-panel-and-strip-state-sync')
    await strip.capture(join(runDir, `${name}-strip.png`))
    await panel.evaluate('window.game.updateSettings({locale:"en"})')
    const town = await panel.evaluate('(async()=>{const command=await window.game.command({c:"returnTown"});return {command,view:await window.game.getView(),state:await window.game.getState()}})()')
    assert(town.command.ok && town.view.dungeon.town && town.state.paused === false, 'Town must stop battle without claiming global pause')
    phase.checks.push('return-town-is-not-global-pause')
    if (!restart) {
      await panel.evaluate('(async()=>{for(const command of [{c:"setOptions",autoEquip:false},{c:"setLoop",loop:false},{c:"selectStage",stageNo:1,depthRank:0}]){const result=await window.game.command(command);if(!result.ok)throw new Error(result.reason)}})()')
      phase.checks.push('long-run-normal-floor-progression-loop-disabled')
    }
    while (!exit && Date.now() < started + durationMs) {
      const sample = await processSample(child.pid)
      const live = await panel.evaluate('(async()=>({state:await window.game.getState(),view:await window.game.getView()}))()')
      assert(!live.state.runtimeError && !live.state.storageError && live.state.paused === false, 'Unexpected pause/save/runtime failure during run')
      if (!restart) assert(live.view.stage.loop === false, 'Long-run acceptance must progress through floors, not loop B1')
      sample.game = { floor: live.view.dungeon.depth, best: live.view.dungeon.best, loop: live.view.stage.loop, playMs: live.view.stats.playMs, town: live.view.dungeon.town, party: live.view.party.length, active: live.view.party.filter(member => member.active).length }
      phase.samples.push(sample)
      console.log(`${name}: ${Math.round((Date.now() - started) / 1000)}s, working set ${Math.round(sample.workingSet / 1048576)}MiB`)
      const wait = Math.min(15000, started + durationMs - Date.now())
      if (wait > 0) await Promise.race([exited, delay(wait)])
    }
    assert(!exit, 'Game exited before acceptance operations completed')
    const finalTown = await panel.evaluate('window.game.command({c:"returnTown"})')
    assert(finalTown.ok, 'Could not save final return to town')
    if (env.GAME_CLOUD_URL) {
      const cloud = await panel.evaluate(`(async()=>{
        const before=await window.game.getView();
        const credentials={username:'qa_'+crypto.randomUUID().replaceAll('-','').slice(0,20),password:crypto.randomUUID()};
        const auth=await window.game.cloudCommand({action:'register',...credentials});
        if(!auth.ok) throw new Error(auth.message);
        const uploaded=await window.game.cloudCommand({action:'upload',revision:0});
        if(!uploaded.ok) throw new Error(uploaded.message);
        const restored=await window.game.cloudCommand({action:'download',revision:uploaded.view.revision});
        if(!restored.ok) throw new Error(restored.message);
        const after=await window.game.getView(), state=await window.game.getState();
        const logout=await window.game.cloudCommand({action:'logout'});
        return {revision:uploaded.view.revision,restoredKoban:after.koban===before.koban,paused:state.paused,logout:logout.ok};
      })()`)
      assert(cloud.revision === 1 && cloud.restoredKoban && cloud.paused && cloud.logout, 'Native cloud save/restore failed')
      phase.cloud = cloud
      phase.checks.push('real-native-ipc-cloud-registration-upload-restore-logout')
    }
    phase.lastView = await panel.evaluate('window.game.getView()')
    phase.frames = await strip.evaluate('window.__acceptanceFrames')
    assert(phase.frames.length > 0 && phase.frames.every(frame => frame.allies === 3), 'Missing frames or an incorrect active party size')
    // This deliberate API fault is a separate recovery test, not a renderer exception.
    // Save the restart contract first; recovery must restore this exact checkpoint.
    const finalLoop = await panel.evaluate('window.game.command({c:"setLoop",loop:true})')
    assert(finalLoop.ok, 'Could not save final loop preference')
    const savePath = join(dataDir, 'save/save.json')
    const importText = readFileSync(savePath, 'utf8'), importProfile = JSON.parse(importText)
    const beforeImport = await panel.evaluate('window.game.getView()')
    const preview = await panel.evaluate(`window.game.prepareSaveImport(${JSON.stringify(importText)})`)
    assert(preview.koban === importProfile.koban && preview.party.length === 3, 'Native import preview does not match the saved file')
    await panel.evaluate(`window.game.confirmSaveImport(${JSON.stringify(preview.token)})`)
    const afterImport = await panel.evaluate('(async()=>({view:await window.game.getView(),state:await window.game.getState()}))()')
    phase.fileImportObservation = { before: beforeImport, after: afterImport }
    assert(afterImport.state.paused && isDeepStrictEqual(afterImport.view, beforeImport), 'Native file import did not restore the checkpoint paused')
    const importCheckpoint = readFileSync(savePath, 'utf8')
    assert(isDeepStrictEqual(JSON.parse(importCheckpoint).rates, importProfile.rates), 'Native import changed the partial earnings interval')
    const importFailures = await panel.evaluate(`(async()=>{
      const errorOf=async fn=>{try{await fn();return null}catch(error){return error.message}};
      const candidate=await window.game.prepareSaveImport(${JSON.stringify(importText)});
      await window.game.cancelSaveImport(candidate.token);
      return {cancelled:await errorOf(()=>window.game.confirmSaveImport(candidate.token)),
        malformed:await errorOf(()=>window.game.prepareSaveImport('{broken')),
        future:await errorOf(()=>window.game.prepareSaveImport(${JSON.stringify(JSON.stringify({ ...importProfile, version: importProfile.version + 1 }))}))};
    })()`)
    assert(importFailures.cancelled?.includes('expired') && importFailures.malformed?.includes('not valid JSON') && importFailures.future, 'Native import rejection or English error translation failed')
    assert(readFileSync(savePath, 'utf8') === importCheckpoint, 'Cancelled or invalid import changed the saved file')
    phase.fileImport = { kind: 'real-native-ipc', roundtripPaused: true, previewMatchesFile: true, earningsIntervalPreserved: true, cancelledAndInvalidUnchanged: true, errors: importFailures }
    phase.checks.push('native-file-import-roundtrip-paused', 'native-file-import-cancel-malformed-future-preserve-save')
    const checkpointView = await panel.evaluate('window.game.getView()')
    const checkpointBytes = readFileSync(savePath, 'utf8')
    const checkpoint = JSON.parse(checkpointBytes)
    assert(checkpoint.progress.inTown && checkpoint.progress.loop, 'Town and loop were not successfully saved before the fault')
    const cause = 'Synthetic packaged acceptance fault: runtime recovery'
    await panel.evaluate(`window.game.reportRuntimeError(${JSON.stringify(cause)})`)
    await until(async () => {
      const stopped = await panel.evaluate('window.game.getState()')
      const notice = await panel.evaluate('document.querySelector(".runtime-failure")?.textContent ?? ""')
      return stopped.paused && stopped.runtimeError === cause && notice.includes(cause)
    })
    const blocked = await panel.evaluate('(async()=>({command:await window.game.command({c:"setLoop",loop:false}),retrySave:await window.game.retrySave(),state:await window.game.getState()}))()')
    assert(!blocked.command.ok && blocked.retrySave === false && !blocked.state.storageError, 'Runtime failure did not independently block mutations and save retry')
    const blockedImport = await panel.evaluate(`(async()=>{try{await window.game.prepareSaveImport(${JSON.stringify(importText)});return null}catch(error){return error.message}})()`)
    assert(blockedImport?.includes(cause), 'Runtime failure did not block file import before validation')
    const controls = await panel.evaluate('({inert:document.querySelector("#app").inert,buttons:document.querySelectorAll(".runtime-failure button").length})')
    assert(controls.inert && controls.buttons === 2, 'Recovery notice did not disable gameplay or expose export/reload controls')
    await panel.capture(join(runDir, name + '-synthetic-runtime-stopped.png'))
    await delay(500)
    assert(readFileSync(savePath, 'utf8') === checkpointBytes, 'Runtime failure overwrote the checkpoint')
    await panel.evaluate('window.__runtimeCheckBeforeReload=true; setTimeout(()=>window.game.reloadAfterRuntimeError(),100); true')
    await until(() => panel.evaluate('Boolean(!window.__runtimeCheckBeforeReload && window.game && document.querySelector(".card"))'), 10000)
    const recovered = await panel.evaluate('(async()=>({state:await window.game.getState(),view:await window.game.getView(),notice:Boolean(document.querySelector(".runtime-failure"))}))()')
    assert(recovered.state.paused && !recovered.state.runtimeError && !recovered.notice, 'Explicit runtime recovery did not reload paused')
    assert(isDeepStrictEqual(recovered.view, checkpointView), 'Recovered view did not match the saved checkpoint')
    assert(readFileSync(savePath, 'utf8') === checkpointBytes, 'Reload overwrote the saved checkpoint')
    const recoveredStrip = await until(async () => {
      const state = await strip.evaluate('window.game.getState()')
      return state.paused && !state.runtimeError && await strip.evaluate('!document.querySelector(".runtime-failure")') ? state : false
    })
    assert(recoveredStrip.paused, 'Strip did not recover paused')
    phase.runtimeRecovery = { kind: 'synthetic-api-fault', cause, commandRejected: true, retrySaveRejected: true, saveUnchanged: true,
      viewMatchesCheckpoint: true, reloadPaused: true, stripReloadPaused: true, checkpointSha256: createHash('sha256').update(checkpointBytes).digest('hex') }
    phase.checks.push('synthetic-runtime-stop-command-save-rejected', 'synthetic-runtime-checkpoint-preserved', 'explicit-reload-checkpoint-matches-paused')
    phase.lastView = recovered.view
    phase.rendererErrors = [...strip.errors, ...panel.errors]
    assert(phase.rendererErrors.length === 0, 'Renderer exceptions were observed')
    strip.close(); panel.close()
    await Promise.race([exited, delay(30000).then(() => { throw new Error('Normal smoke quit did not finish') })])
    assert(exit.code === 0, `Packaged exit code ${exit.code}`)
    await until(() => portClosed(port), 5000)
    phase.checks.push('normal-smoke-quit-code-zero', 'debugger-port-closed')
    const observedPids = [...new Set([child.pid, ...phase.samples.flatMap(sample => sample.processes.map(process => process.pid))])]
    const remaining = await powershell(`@(${observedPids.join(',')}) | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_.ProcessName -eq 'TaskbarHyakkiko' } | Select-Object Id,ProcessName | ConvertTo-Json -Compress`)
    phase.remainingObservedProcesses = remaining
    assert(Array.isArray(remaining) && remaining.length === 0, 'A sampled game child process remained after normal exit')
    phase.checks.push('observed-game-processes-exited')
    const save = JSON.parse(readFileSync(join(dataDir, 'save/save.json'), 'utf8'))
    assert(save.version === 3 && save.progress.inTown && save.progress.loop && save.options.autoEquip === false && Object.keys(save.party.members).length === 17, 'Normal quit did not persist the expected save')
    assert(Number.isFinite(save.rates.elapsedMs) && save.rates.elapsedMs >= 0 && save.rates.elapsedMs < 60000, 'Partial earnings interval was not persisted')
    phase.saved = { version: save.version, savedAt: save.savedAt, inTown: save.progress.inTown, members: Object.keys(save.party.members).length, playMs: save.stats.playMs, rates: save.rates }
    phase.exit = exit; phase.ok = true
  } catch (error) {
    phase.error = error.message; phase.ok = false
    throw error
  } finally {
    strip?.close(); panel?.close()
    if (!exit && child.pid) {
      // This is the direct process we started, never a title/name match or an unrelated game instance.
      const stop = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      await new Promise(res => { stop.once('exit', res); stop.once('error', res) })
      await Promise.race([exited.catch(() => {}), delay(3000)])
      phase.forcedCleanup = true
    }
    const ownedPids = [...new Set(phase.samples.flatMap(sample => sample.processes.map(process => process.pid)))]
    if (ownedPids.length) {
      const quotedExe = exe.replaceAll("'", "''")
      phase.cleanedRemaining = await powershell(`$since = [DateTimeOffset]::FromUnixTimeMilliseconds(${started}).UtcDateTime; @(${ownedPids.join(',')}) | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p -and $p.Path -eq '${quotedExe}' -and $p.StartTime.ToUniversalTime() -ge $since) { $p.Id; Stop-Process -Id $p.Id -Force -ErrorAction Stop } } | ConvertTo-Json -Compress`)
    }
    phase.exit ??= exit
    phase.debuggerClosed = await portClosed(port)
    phase.endedAt = new Date().toISOString()
    writeFileSync(join(runDir, `${name}-stdout.log`), stdout)
    writeFileSync(join(runDir, `${name}-stderr.log`), stderr)
    phase.stderrTail = stderr.slice(-4000)
    writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  }
}

try {
  await phase('first-run', Math.max(15000, minutes * 60000), false)
  await phase('restart', 8000, true)
  report.ok = true
} catch (error) {
  report.errors.push(error.message); report.ok = false; process.exitCode = 1
} finally {
  report.endedAt = new Date().toISOString()
  const log = join(dataDir, 'logs/main.log')
  if (existsSync(log)) report.mainLog = readFileSync(log, 'utf8')
  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`${report.ok ? 'PACKAGED CHECK PASS' : 'PACKAGED CHECK FAILED'} (${label})`)
  console.log(join(runDir, 'report.json'))
}
