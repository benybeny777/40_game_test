import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, lstatSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { newProfile, type Profile } from '../src/core/progress/profile.ts'
import { prepareCloudRestore } from '../src/shared/cloudProfile.ts'
import { CloudClient } from '../src/shared/cloudClient.ts'
import type { CloudCommand } from '../src/shared/cloud.ts'

interface SaveServer {
  listen(options: { host: string; port: number }): Promise<{ address: string; port: number }>
  close(): Promise<void>
}
const { values } = parseArgs({ options: { 'server-root': { type: 'string' } } })
assert.ok(values['server-root'], 'Pass --server-root with the separate save-server repository')
const serverRoot = realpathSync(resolve(values['server-root']))
const entry = join(serverRoot, 'src', 'app.mjs')
assert.ok(statSync(entry).isFile(), 'The server entry must be an existing file')
assert.ok(realpathSync(entry).startsWith(serverRoot + sep), 'Server entry must remain inside the selected repository')
const module = await import(pathToFileURL(entry).href)
const createSaveServer = module.createSaveServer as (options: { databasePath: string; logger: (error: unknown) => void }) => SaveServer
assert.equal(typeof createSaveServer, 'function', 'The server must export createSaveServer')

const tempParent = realpathSync(tmpdir())
const lab = mkdtempSync(join(tempParent, 'hyakkiko-cloud-contract-'))
const databasePath = join(lab, 'accounts.sqlite')
const credentials = { username: 'contract_a', password: randomBytes(24).toString('base64url') }
const secondCredentials = { username: 'contract_b', password: randomBytes(24).toString('base64url') }
const checks: string[] = []
let server: SaveServer | undefined
let serverErrors = 0
let cleaned: boolean
let failure: unknown

async function start() {
  assert.equal(server, undefined, 'Do not start a second test server over an active database')
  server = createSaveServer({ databasePath, logger: () => { serverErrors++ } })
  const address = await server.listen({ host: '127.0.0.1', port: 0 })
  assert.equal(address.address, '127.0.0.1')
  assert.ok(address.port > 0 && address.port !== 8787, 'Integration test must not use the live service port')
  return `http://127.0.0.1:${address.port}`
}
async function stop() {
  if (!server) return
  await server.close()
  server = undefined
}
async function succeed(client: CloudClient, command: CloudCommand, label: string) {
  const result = await client.execute(command)
  assert.equal(result.ok, true, `${label} must succeed`)
  assert.equal(result.view.error, null, `${label} must not hide an error`)
  return result.view
}
function assertSafeCleanup(path: string) {
  assert.equal(dirname(path), tempParent, 'Cleanup must remain a direct child of the system temp folder')
  assert.ok(path.startsWith(join(tempParent, 'hyakkiko-cloud-contract-')), 'Cleanup must use this test prefix')
  assert.equal(lstatSync(path).isSymbolicLink(), false, 'Cleanup root must not be a link')
  assert.equal(realpathSync(path), path, 'Cleanup root must resolve to its original absolute path')
  const visit = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, item.name)
      assert.equal(lstatSync(child).isSymbolicLink(), false, 'Test artifacts must not include links')
      assert.ok(realpathSync(child).startsWith(path + sep), 'Cleanup member must remain inside this test directory')
      if (item.isDirectory()) visit(child)
    }
  }
  visit(path)
}

try {
  let endpoint = await start()
  let localA: Profile = newProfile(new Date().toISOString(), 11)
  localA.koban = 777
  localA.rates.elapsedMs = 30000
  localA.rates.current = { koban: 123, exp: 456 }
  localA.rates.legacyUnmeasuredGain = { koban: 10, exp: 20 }
  const clientA = new CloudClient(endpoint, { readProfile: () => localA, restoreProfile: raw => { localA = prepareCloudRestore(raw) } })
  const account = await succeed(clientA, { action: 'register', ...credentials }, 'First account registration')
  assert.equal(account.revision, 0)
  await succeed(clientA, { action: 'upload', revision: 0 }, 'Initial upload')
  assert.equal(clientA.view().revision, 1)
  checks.push('register-upload-revision-1')

  let localB = newProfile(new Date().toISOString(), 22)
  const clientB = new CloudClient(endpoint, { readProfile: () => localB, restoreProfile: raw => { localB = prepareCloudRestore(raw) } })
  await succeed(clientB, { action: 'login', ...credentials }, 'Second client login')
  assert.equal(clientB.view().account?.id, account.account?.id)
  assert.equal(clientB.view().revision, 1)
  localB.koban = 4
  await succeed(clientB, { action: 'download', revision: 1 }, 'Cross-client restore')
  assert.equal(localB.koban, 777)
  assert.deepEqual(localB.rates, localA.rates, 'Cross-client restore must preserve the partial minute and legacy earnings')
  checks.push('second-client-restores-777-koban')
  checks.push('second-client-preserves-partial-minute-and-legacy-earnings')

  await succeed(clientA, { action: 'upload', revision: 1 }, 'Second revision upload')
  const conflict = await clientB.execute({ action: 'upload', revision: 1 })
  assert.equal(conflict.ok, false); assert.equal(conflict.view.revision, null)
  assert.ok(conflict.view.error, 'Conflict must be visible')
  assert.equal((await clientB.execute({ action: 'upload', revision: 2 })).ok, false, 'Conflict requires explicit refresh')
  await succeed(clientB, { action: 'refresh' }, 'Conflict refresh')
  assert.equal(clientB.view().revision, 2)
  await succeed(clientB, { action: 'logout' }, 'Second client logout')
  assert.equal(clientB.view().account, null)
  checks.push('stale-write-conflict-refresh-logout')

  await stop()
  assert.ok(statSync(databasePath).size > 0, 'SQLite database must exist on disk')
  endpoint = await start()
  let restored = newProfile(new Date().toISOString(), 33)
  const restarted = new CloudClient(endpoint, { readProfile: () => restored, restoreProfile: raw => { restored = prepareCloudRestore(raw) } })
  await succeed(restarted, { action: 'login', ...credentials }, 'Login after server restart')
  assert.equal(restarted.view().revision, 2)
  await succeed(restarted, { action: 'download', revision: 2 }, 'Restore after server restart')
  assert.equal(restored.koban, 777)
  assert.deepEqual(restored.rates, localA.rates, 'SQLite restart must retain the complete earnings interval')
  checks.push('sqlite-restart-retains-revision-2-and-777-koban')

  const future = { ...restored, version: 999 }
  const futureWriter = new CloudClient(endpoint, { readProfile: () => future, restoreProfile: () => { throw new Error('Not used') } })
  await succeed(futureWriter, { action: 'login', ...credentials }, 'Future-format fixture login')
  await succeed(futureWriter, { action: 'upload', revision: 2 }, 'Future-format fixture upload')
  await succeed(restarted, { action: 'refresh' }, 'Future-format metadata refresh')
  const before = JSON.stringify(restored)
  const failedRestore = await restarted.execute({ action: 'download', revision: 3 })
  assert.equal(failedRestore.ok, false)
  assert.ok(failedRestore.view.error, 'Rejected future restore must be visible')
  assert.equal(JSON.stringify(restored), before, 'Failed restore must not modify the local profile')
  checks.push('future-profile-rejected-with-local-state-preserved')

  const isolated = new CloudClient(endpoint, { readProfile: () => ({}), restoreProfile: () => { throw new Error('Empty account must not restore') } })
  await succeed(isolated, { action: 'register', ...secondCredentials }, 'Independent account registration')
  assert.notEqual(isolated.view().account?.id, account.account?.id)
  assert.equal(isolated.view().revision, 0)
  assert.equal((await isolated.execute({ action: 'download', revision: 0 })).ok, false)
  assert.equal(serverErrors, 0, 'The server must not hide an internal error')
  await succeed(isolated, { action: 'logout' }, 'Independent account logout')
  await succeed(restarted, { action: 'logout' }, 'Restarted client logout')
  await succeed(futureWriter, { action: 'logout' }, 'Future fixture client logout')
  checks.push('separate-account-has-no-save')
} catch (error) { failure = error }
finally {
  await stop()
  assert.equal(server, undefined, 'Close SQLite and the listening socket before cleanup')
  assertSafeCleanup(lab)
  rmSync(lab, { recursive: true })
  cleaned = !existsSync(lab)
  assert.equal(cleaned, true, 'The dedicated test database must be removed')
}
if (failure) throw failure
console.log(JSON.stringify({ ok: true, transport: 'real-http-loopback', database: 'real-sqlite-persisted-and-reopened', checks, cleanup: cleaned }))
