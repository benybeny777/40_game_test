import { join } from 'node:path'

// The sole authority for runtime, renderer and profile paths. No writes on import.
export function resolvePaths(projectRoot: string, userData: string, profile: string | undefined) {
  const development = profile === 'dev'
  const data = development ? join(projectRoot, '.dev-data') : userData
  return {
    profile: development ? 'dev' as const : 'user' as const,
    data,
    session: join(data, 'session'),
    logs: join(data, 'logs'),
    verification: join(data, 'verification'),
    save: join(data, 'save', 'save.json'),
    previousSave: join(data, 'save', 'save.prev.json'),
    preload: join(projectRoot, 'out/preload/index.js'),
    renderer: (page: 'strip' | 'panel') => join(projectRoot, 'out/renderer', page, 'index.html'),
  }
}
