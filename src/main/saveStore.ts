import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { newProfile, validateProfile, type Profile } from '../core/index.ts'
import { defaultSettings, type Settings } from '../shared/api'
import { parseSettings } from '../shared/validate'

export interface SavePaths { save: string; previousSave: string; brokenSave: string; settings: string }
export type LoadSource = 'save' | 'prev' | 'new'

/** Write to a temp file, fsync, rotate the current save to .prev, then move the temp file into place. */
export function writeAtomic(path: string, text: string, previous?: string) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  const fd = openSync(temp, 'w')
  try { writeSync(fd, text); fsyncSync(fd) } finally { closeSync(fd) }
  if (previous && existsSync(path)) renameSync(path, previous)
  renameSync(temp, path)
}
export function saveProfile(paths: SavePaths, profile: Profile, now = new Date()) {
  profile.savedAt = now.toISOString()
  writeAtomic(paths.save, JSON.stringify(profile), paths.previousSave)
}
/** save.json → save.prev.json → new. The first unreadable file is kept once as save.broken.json (saves are not re-creatable). */
export function loadProfile(paths: SavePaths, now = new Date()): { profile: Profile; source: LoadSource; errors: string[] } {
  const errors: string[] = []
  let keptBroken = false
  for (const [path, source] of [[paths.save, 'save'], [paths.previousSave, 'prev']] as const) {
    if (!existsSync(path)) continue
    try { return { profile: validateProfile(JSON.parse(readFileSync(path, 'utf8'))), source, errors } } catch (error) {
      errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`)
      if (!keptBroken) { copyFileSync(path, paths.brokenSave); keptBroken = true }
    }
  }
  return { profile: newProfile(now.toISOString()), source: 'new', errors }
}
export function loadSettings(paths: SavePaths): Settings {
  try { return { ...defaultSettings, ...(parseSettings(JSON.parse(readFileSync(paths.settings, 'utf8'))) ?? {}) } } catch { return { ...defaultSettings } }
}
export function saveSettings(paths: SavePaths, settings: Settings) { writeAtomic(paths.settings, JSON.stringify(settings, null, 2)) }
