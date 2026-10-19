import { spawn } from 'node:child_process'

// electron-vite owns Vite and Electron; it exits when the tray quits Electron.
const env = { ...process.env, GAME_PROFILE: 'dev' }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(process.execPath, ['node_modules/electron-vite/bin/electron-vite.js', 'dev', '--watch'], {
  stdio: 'inherit', env,
})
child.on('error', (error) => { console.error(error); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
