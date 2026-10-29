import { closeSync, constants, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { newProfile, PROFILE_VERSION, validateProfile, type Profile } from '../core/index.ts'
import { defaultSettings, type Settings } from '../shared/api'
import { parseSettings } from '../shared/validate'

export interface SavePaths { save: string; previousSave: string; brokenSave: string; settings: string }
export type LoadSource = 'save' | 'prev' | 'new'
export interface LoadedProfile { profile: Profile; source: LoadSource; errors: string[] }

/** Loading a fallback is not permission to overwrite the current save or start progression. */
export function confirmSaveRecovery(loaded: Pick<LoadedProfile, 'source' | 'errors'>, choose: () => number): 'continue' | 'restore-paused' | 'exit' {
  if (loaded.source !== 'prev' && loaded.errors.length === 0) return 'continue'
  return choose() === 1 ? 'restore-paused' : 'exit'
}

export class FutureSaveVersionError extends Error {
  constructor(readonly path: string, readonly version: number) {
    super(`このセーブは新しいバージョン（形式${version}）で保存されています。対応する最新版で開いてください。セーブは変更していません。\n${path}`)
    this.name = 'FutureSaveVersionError'
  }
}
export class SaveRecoveryRequiredError extends Error {
  constructor(readonly path: string) {
    super(`セーブを安全に読み込めませんでした。ファイルを変更せず起動を中止しました。セーブのフォルダを確認してください。\n${path}`)
    this.name = 'SaveRecoveryRequiredError'
  }
}
function assertNoFutureSave(path: string) {
  if (!existsSync(path)) return
  let raw: unknown
  try { raw = JSON.parse(readFileSync(path, 'utf8')) } catch { return }
  if (typeof raw === 'object' && raw !== null && 'version' in raw && Number.isInteger(raw.version) && Number(raw.version) > PROFILE_VERSION) {
    throw new FutureSaveVersionError(path, Number(raw.version))
  }
}
function assertWritableVersion(paths: SavePaths) {
  // Previous or interrupted writes may also belong to a newer build; rotating them would destroy recoverable data.
  for (const path of [paths.save, paths.previousSave, `${paths.save}.tmp`, `${paths.previousSave}.tmp`]) assertNoFutureSave(path)
}
function preserveBroken(paths: SavePaths, path: string, text: string) {
  if (existsSync(paths.brokenSave)) {
    if (readFileSync(paths.brokenSave, 'utf8') !== text) throw new SaveRecoveryRequiredError(path)
  } else copyFileSync(path, paths.brokenSave, constants.COPYFILE_EXCL)
}

/** Keep the current file present until replacement. A failed write never moves it out of the way. */
export function writeAtomic(path: string, text: string, previous?: string) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  const fd = openSync(temp, 'w')
  try { writeFileSync(fd, text, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
  // Commit the previous generation atomically too; an interrupted backup must not truncate the last good .prev.
  if (previous && existsSync(path)) writeAtomic(previous, readFileSync(path, 'utf8'))
  renameSync(temp, path)
}
export function saveProfile(paths: SavePaths, profile: Profile, now = new Date()) {
  assertWritableVersion(paths)
  let previous: string | undefined
  if (existsSync(paths.save)) {
    let text: string
    try { text = readFileSync(paths.save, 'utf8') } catch { throw new SaveRecoveryRequiredError(paths.save) }
    try { validateProfile(JSON.parse(text)); previous = paths.previousSave } catch { preserveBroken(paths, paths.save, text) }
  }
  const savedAt = now.toISOString()
  writeAtomic(paths.save, JSON.stringify({ ...profile, savedAt }), previous)
  profile.savedAt = savedAt
}
/** save.json → save.prev.json → new. The first unreadable file is kept once as save.broken.json (saves are not re-creatable). */
export function loadProfile(paths: SavePaths, now = new Date()): LoadedProfile {
  assertWritableVersion(paths)
  const errors: string[] = []
  let keptBroken = false
  for (const [path, source] of [[paths.save, 'save'], [paths.previousSave, 'prev']] as const) {
    if (!existsSync(path)) continue
    let text: string
    try { text = readFileSync(path, 'utf8') } catch { throw new SaveRecoveryRequiredError(path) }
    try { return { profile: validateProfile(JSON.parse(text)), source, errors } } catch (error) {
      errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`)
      if (!keptBroken) {
        preserveBroken(paths, path, text)
        keptBroken = true
      }
    }
  }
  if (errors.length) throw new SaveRecoveryRequiredError(paths.save)
  return { profile: newProfile(now.toISOString()), source: 'new', errors }
}
export function loadSettings(paths: SavePaths, locale: 'ja' | 'en' = 'ja'): Settings {
  let text: string
  try { text = readFileSync(paths.settings, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...defaultSettings, locale }
    throw new Error(`設定を読み込めません。ファイルは変更していません。\n${paths.settings}`, { cause: error })
  }
  try {
    const settings = parseSettings(JSON.parse(text))
    if (!settings) throw new Error('設定の形式が正しくありません')
    return { ...defaultSettings, locale, ...settings }
  } catch (error) {
    throw new Error(`設定が破損しているため起動を中止しました。ファイルは変更していません。\n${paths.settings}`, { cause: error })
  }
}
export function saveSettings(paths: SavePaths, settings: Settings) { writeAtomic(paths.settings, JSON.stringify(settings, null, 2)) }
