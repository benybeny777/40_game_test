import { join } from 'node:path'

// The sole authority for runtime, renderer and profile paths. No writes on import.
// dataDir (env GAME_DATA_DIR) is only for local verification of a packaged build, so testing never writes the real user save.
export function resolvePaths(projectRoot: string, userData: string, profile: string | undefined, dataDir?: string) {
  const development = profile === 'dev'
  const data = dataDir || (development ? join(projectRoot, '.dev-data') : userData)
  return {
    profile: development ? 'dev' as const : 'user' as const,
    data,
    session: join(data, 'session'),
    logs: join(data, 'logs'),
    verification: join(data, 'verification'),
    save: join(data, 'save', 'save.json'),
    previousSave: join(data, 'save', 'save.prev.json'),
    brokenSave: join(data, 'save', 'save.broken.json'),
    settings: join(data, 'settings.json'),
    commerce: join(data, 'commerce.json'),
    commerceSandbox: join(data, 'commerce.sandbox.json'),
    preload: join(projectRoot, 'out/preload/index.js'),
    renderer: (page: 'strip' | 'panel') => join(projectRoot, 'out/renderer', page, 'index.html'),
  }
}
