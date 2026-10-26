import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolvePaths } from '../src/main/paths.ts'
const require = createRequire(import.meta.url)
const env = { ...process.env, GAME_PROFILE: 'dev', GAME_DATA_DIR: resolvePaths(process.cwd(), '', 'dev').verification }
delete env.ELECTRON_RUN_AS_NODE
const args = process.argv.slice(2)
const visual = args.includes('--visual')
const fullscreen = args.includes('--fullscreen')
const child = spawn(require('electron'), visual ? ['tools/visual-check.cjs'] : fullscreen ? ['tools/fullscreen-check.cjs'] : ['tools/m0-check.cjs', ...(args.length ? args : ['--verify'])], { env, stdio: 'inherit' })
child.once('error', (error) => { console.error(error); process.exitCode = 1 })
child.once('exit', (code) => { process.exitCode = code ?? 1 })
