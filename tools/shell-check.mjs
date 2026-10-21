import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const env = { ...process.env, GAME_PROFILE: 'dev' }
delete env.ELECTRON_RUN_AS_NODE
const args = process.argv.slice(2)
const visual = args.includes('--visual')
const child = spawn(require('electron'), visual ? ['tools/visual-check.cjs'] : ['tools/m0-check.cjs', ...(args.length ? args : ['--verify'])], { env, stdio: 'inherit' })
child.once('error', (error) => { console.error(error); process.exitCode = 1 })
child.once('exit', (code) => { process.exitCode = code ?? 1 })
