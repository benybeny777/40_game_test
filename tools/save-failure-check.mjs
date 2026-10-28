// Runs only the newly created lab; never uses the shared verification or a user profile.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { setTimeout, clearTimeout } from 'node:timers'
import { fileURLToPath, URL } from 'node:url'
import { resolvePaths } from '../src/main/paths.ts'
const require = createRequire(import.meta.url)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const nonce = randomBytes(8).toString('hex')
const lab = resolve(root, '.dev-data', 'save-failure-' + Date.now() + '-' + nonce)
const freeGiB = () => { const disk = statfsSync(root); return Math.round(disk.bavail * disk.bsize / 1024 ** 3 * 100) / 100 }
const syntax = spawnSync(process.execPath, ['--check', resolve(root, 'tools/save-failure-check.cjs')], { stdio: 'inherit' })
if (syntax.status !== 0) throw new Error('Verification script failed syntax validation')
const beforeFreeGiB = freeGiB()
mkdirSync(lab, { recursive: true }); writeFileSync(join(lab, '.owner.json'), JSON.stringify({ nonce }))
const paths = resolvePaths(root, '', 'dev', lab)
const env = { ...process.env, GAME_PROFILE: 'dev', GAME_DATA_DIR: lab, GAME_SPEED: '1', GAME_SAVE_CHECK_PATHS: JSON.stringify(paths), GAME_SAVE_CHECK_NONCE: nonce }
for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_ENTRY', 'ELECTRON_RENDERER_URL', 'GAME_SMOKE_QUIT_MS', 'GAME_STORE_SANDBOX']) delete env[key]
console.log('SAVE_FAILURE_LAB ' + JSON.stringify({ path: lab, beforeFreeGiB }))
const child = spawn(require('electron'), [resolve(root, 'tools/save-failure-check.cjs'), '--save-failure-id=' + nonce], { cwd: root, env, stdio: 'inherit' })
let timedOut = false
const timeout = setTimeout(() => {
  timedOut = true
  if (child.exitCode !== null) return
  console.error('Save-failure child exceeded 45 seconds; terminating only its PID tree: ' + child.pid)
  if (process.platform === 'win32') {
    const identity = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$owned = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $env:GAME_SAVE_CHECK_PID); if ($owned -and $owned.CommandLine -and $owned.CommandLine.Contains("--save-failure-id=" + $env:GAME_SAVE_CHECK_TOKEN)) { exit 0 }; exit 2'], { env: { ...process.env, GAME_SAVE_CHECK_PID: String(child.pid), GAME_SAVE_CHECK_TOKEN: nonce } })
    if (identity.status === 0) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'inherit' })
    else console.error('Could not verify child identity; no unrelated process was terminated')
  }
  else child.kill('SIGKILL')
}, 45000)
function noLinks(target) {
  if (lstatSync(target).isSymbolicLink()) throw new Error('Refusing cleanup of a link: ' + target)
  if (lstatSync(target).isDirectory()) for (const entry of readdirSync(target)) noLinks(join(target, entry))
}
function cleanup() {
  const part = relative(resolve(root, '.dev-data'), lab)
  if (!part || part.startsWith('..') || isAbsolute(part) || !/^save-failure-\d+-[a-f0-9]+$/.test(basename(lab))) throw new Error('Invalid cleanup scope')
  if (JSON.parse(readFileSync(join(lab, '.owner.json'), 'utf8')).nonce !== nonce) throw new Error('Lab ownership mismatch')
  if (process.platform === 'win32') {
    const query = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$items = @(Get-CimInstance Win32_Process | Where-Object { ($_.ProcessId -eq [int]$env:GAME_SAVE_CHECK_OWNED_PID) -or ($_.ParentProcessId -eq [int]$env:GAME_SAVE_CHECK_OWNED_PID) -or ($_.CommandLine -and $_.CommandLine.Contains($env:GAME_SAVE_CHECK_OWNED_DIR)) } | Select-Object ProcessId,Name); ConvertTo-Json -InputObject $items -Compress'], { encoding: 'utf8', env: { ...process.env, GAME_SAVE_CHECK_OWNED_DIR: lab, GAME_SAVE_CHECK_OWNED_PID: String(child.pid) } })
    if (query.status !== 0) throw new Error('Could not verify that lab processes stopped')
    const processes = JSON.parse(query.stdout.trim() || '[]')
    if (processes.length) throw new Error('Lab still in use: ' + JSON.stringify(processes))
  }
  noLinks(lab)
  rmSync(lab, { recursive: true })
  if (existsSync(lab)) throw new Error('Lab remains after cleanup')
  console.log('SAVE_FAILURE_CLEANUP ' + JSON.stringify({ path: lab, exists: false, beforeFreeGiB, afterFreeGiB: freeGiB(), childExitCode: child.exitCode }))
}
child.once('error', error => { clearTimeout(timeout); console.error(error); try { cleanup() } catch (failure) { console.error('Lab retained: ' + lab + ': ' + failure) } process.exitCode = 1 })
child.once('exit', (code, signal) => {
  clearTimeout(timeout)
  console.log('SAVE_FAILURE_CHILD_EXIT ' + JSON.stringify({ pid: child.pid, code, signal, timedOut }))
  try { cleanup() } catch (error) { console.error('Lab retained: ' + lab + ': ' + error); process.exitCode = 1 }
  if (code !== 0 || signal || timedOut) process.exitCode = 1
})
