// Local-only distribution audit. Never launches SteamCMD, uploads a depot, or publishes a build.
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, lstatSync, openSync, closeSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const normal = path => path.replaceAll('\\', '/').replace(/^\/+/, '')
const forbidden = /^(?:\.dev-data|\.claude|\.git|src|tests|tools|steam|release)(?:\/|$)|(?:^|\/)(?:\.env(?:\.[^/]*)?|steam_appid\.txt|save(?:\.[^/]*)?\.json|settings\.json|commerce\.json|.*\.(?:pfx|p12|pem|key))$/i
const secrets = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{30,}|\bsk-proj-[A-Za-z0-9_-]{30,}/

export function auditArchivePaths(paths) {
  for (const path of paths) if (forbidden.test(normal(path))) throw new Error(`配布対象に開発データ・秘密情報の候補があります: ${path}`)
}
function peMachine(path) {
  const fd = openSync(path, 'r')
  try {
    const dos = Buffer.alloc(64); readSync(fd, dos, 0, dos.length, 0)
    if (dos.toString('ascii', 0, 2) !== 'MZ') throw new Error(`Windows実行ファイルではありません: ${path}`)
    const pe = Buffer.alloc(6); readSync(fd, pe, 0, pe.length, dos.readUInt32LE(60))
    if (pe.toString('ascii', 0, 4) !== 'PE\0\0') throw new Error(`PEヘッダーを読み取れません: ${path}`)
    return pe.readUInt16LE(4)
  } finally { closeSync(fd) }
}
async function sha256(path) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}
function collect(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (lstatSync(path).isSymbolicLink()) throw new Error(`配布フォルダ内の外部リンクを確認してください: ${path}`)
    if (entry.isDirectory()) collect(path, result)
    else if (entry.isFile()) result.push(path)
  }
  return result
}
export async function checkRelease() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const destination = resolve(root, pkg.build.directories.output)
  if (!destination.startsWith(root + '\\') && !destination.startsWith(root + '/')) throw new Error('配布先はプロジェクト内に限定してください')
  const unpacked = join(destination, 'win-unpacked'), archive = join(unpacked, 'resources', 'app.asar')
  const exe = join(unpacked, `${pkg.build.executableName}.exe`)
  const portable = join(destination, pkg.build.portable.artifactName.replace('${version}', pkg.version))
  for (const path of [archive, exe, portable]) if (!existsSync(path)) throw new Error(`配布物がありません。先に pnpm dist を実行してください: ${path}`)
  const applicationMachine = peMachine(exe), portableMachine = peMachine(portable)
  if (applicationMachine !== 0x8664) throw new Error('アプリ本体がWindows x64ではありません')
  // NSIS uses a 32-bit self-extracting launcher even when the packaged Electron application is x64.
  if (portableMachine !== 0x14c && portableMachine !== 0x8664) throw new Error('portableのWindows起動形式を確認できません')

  // Resolve the already-installed packaging dependency through its owner, preserving the pnpm dependency boundary.
  const require = createRequire(import.meta.url)
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
  const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
  const asar = appBuilderRequire('@electron/asar')
  const entries = asar.listPackage(archive).map(normal)
  auditArchivePaths(entries)
  for (const required of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/panel/index.html', 'out/renderer/strip/index.html', 'package.json']) {
    if (!entries.includes(required)) throw new Error(`必要なファイルがありません: ${required}`)
  }
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
  if (packaged.version !== pkg.version) throw new Error('配布物のバージョンがソースと一致しません')
  for (const path of entries.filter(path => /^out\/.+\.(?:js|html|css|json)$/.test(path))) {
    if (secrets.test(asar.extractFile(archive, path.replaceAll('/', sep)).toString('utf8'))) throw new Error(`秘密鍵・APIキー候補を検出しました: ${path}`)
  }
  const native = collect(join(unpacked, 'resources', 'app.asar.unpacked')).map(path => normal(relative(unpacked, path)))
  if (!native.some(path => /koffi.*win32_x64.*\.node$/.test(path))) throw new Error('Windows x64の全画面検知モジュールがありません')
  const files = []
  for (const path of [...collect(unpacked), portable]) {
    const name = normal(relative(destination, path))
    auditArchivePaths([name.replace(/^win-unpacked\//, '')])
    files.push({ path: name, bytes: statSync(path).size, sha256: await sha256(path) })
  }
  const manifest = { product: pkg.build.productName, version: pkg.version, platform: 'win32-x64', checkedAt: new Date().toISOString(),
    checks: ['application-PE/x64', 'portable-PE/x86-or-x64-launcher', 'asar-required-files', 'development-data-excluded', 'known-secret-patterns', 'native-koffi'],
    executableMachines: { application: `0x${applicationMachine.toString(16)}`, portableLauncher: `0x${portableMachine.toString(16)}` },
    signature: 'not-verified', steamPublished: false, realPaymentsVerified: false, files }
  const manifestPath = join(destination, 'release-manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`RELEASE FILE CHECK PASS: ${files.length} files, version ${pkg.version}`)
  console.log(`SHA-256 manifest: ${manifestPath}`)
  console.log('実exeの操作、署名、クリーンPC、Steam審査、実決済の確認は別途必要です。')
  return manifest
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRelease().catch(error => { console.error(error.message); process.exitCode = 1 })
}
