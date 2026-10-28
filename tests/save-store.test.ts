import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newProfile, PROFILE_VERSION } from '../src/core/index.ts'
import { FutureSaveVersionError, loadProfile, SaveRecoveryRequiredError, saveProfile, writeAtomic, type SavePaths } from '../src/main/saveStore.ts'

let directory = '', paths: SavePaths
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hyakkiko-save-quality-'))
  paths = { save: join(directory, 'save.json'), previousSave: join(directory, 'save.prev.json'), brokenSave: join(directory, 'save.broken.json'), settings: join(directory, 'settings.json') }
})
afterEach(() => {
  if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\') && !resolve(directory).startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe test cleanup path')
  if (!directory.includes('hyakkiko-save-quality-')) throw new Error('Unexpected test cleanup directory')
  rmSync(directory, { recursive: true, force: true })
})

describe('製品セーブの保護', () => {
  it('新規フォルダだけは新しいプロフィールを作る', () => {
    expect(loadProfile(paths).source).toBe('new')
    expect(existsSync(paths.save)).toBe(false)
  })
  it.each(['save', 'previousSave'] as const)('未来版の%sを見つけたら、ロードも保存も変更せず拒否する', key => {
    const profile = newProfile('original'); profile.koban = 48
    saveProfile(paths, profile)
    const future = JSON.stringify({ version: PROFILE_VERSION + 1, unique: 'do not overwrite' })
    writeFileSync(paths[key], future)
    const original = readFileSync(paths.save, 'utf8')
    expect(() => loadProfile(paths)).toThrow(FutureSaveVersionError)
    expect(() => saveProfile(paths, newProfile('new'))).toThrow(FutureSaveVersionError)
    expect(readFileSync(paths[key], 'utf8')).toBe(future)
    expect(readFileSync(paths.save, 'utf8')).toBe(original)
    expect(existsSync(paths.brokenSave)).toBe(false)
  })
  it('未来版の未完了ファイルも上書きしない', () => {
    const future = JSON.stringify({ version: PROFILE_VERSION + 1 })
    writeFileSync(`${paths.save}.tmp`, future)
    expect(() => loadProfile(paths)).toThrow(FutureSaveVersionError)
    expect(() => saveProfile(paths, newProfile('t'))).toThrow(FutureSaveVersionError)
    expect(readFileSync(`${paths.save}.tmp`, 'utf8')).toBe(future)
  })
  it('両世代が破損していたら自動で初期化しない', () => {
    writeFileSync(paths.save, '{partial')
    writeFileSync(paths.previousSave, 'null')
    expect(() => loadProfile(paths)).toThrow(SaveRecoveryRequiredError)
    expect(readFileSync(paths.save, 'utf8')).toBe('{partial')
    expect(readFileSync(paths.previousSave, 'utf8')).toBe('null')
  })
  it('既存の破損原本を別の破損で上書きしない', () => {
    writeFileSync(paths.save, '{new corruption')
    writeFileSync(paths.brokenSave, '{older irreplaceable data')
    writeFileSync(paths.previousSave, JSON.stringify(newProfile('good')))
    expect(() => loadProfile(paths)).toThrow(SaveRecoveryRequiredError)
    expect(readFileSync(paths.brokenSave, 'utf8')).toBe('{older irreplaceable data')
  })
  it('前世代から復旧後の再保存は、有効な前世代を破損データで潰さない', () => {
    const profile = newProfile('t'); profile.koban = 19
    saveProfile(paths, profile); saveProfile(paths, profile)
    const previous = readFileSync(paths.previousSave, 'utf8')
    writeFileSync(paths.save, '{broken')
    const loaded = loadProfile(paths)
    expect(loaded.source).toBe('prev')
    loaded.profile.koban = 20
    saveProfile(paths, loaded.profile)
    expect(readFileSync(paths.previousSave, 'utf8')).toBe(previous)
    expect(loadProfile(paths).profile.koban).toBe(20)
    expect(readFileSync(paths.brokenSave, 'utf8')).toBe('{broken')
  })
  it('前世代の更新が失敗しても正本と保存日時を変更しない', () => {
    const profile = newProfile('t'); saveProfile(paths, profile)
    const text = readFileSync(paths.save, 'utf8'), savedAt = profile.savedAt
    mkdirSync(paths.previousSave)
    writeFileSync(join(paths.previousSave, 'blocker'), 'keep')
    profile.koban = 999
    expect(() => saveProfile(paths, profile, new Date('2030-01-01T00:00:00Z'))).toThrow()
    expect(readFileSync(paths.save, 'utf8')).toBe(text)
    expect(profile.savedAt).toBe(savedAt)
    expect(readFileSync(join(paths.previousSave, 'blocker'), 'utf8')).toBe('keep')
  })
  it('置換失敗時も書き込み先の内容を消さない', () => {
    const target = join(directory, 'blocked')
    mkdirSync(target); writeFileSync(join(target, 'keep'), 'original')
    expect(() => writeAtomic(target, 'new content')).toThrow()
    expect(readFileSync(join(target, 'keep'), 'utf8')).toBe('original')
    expect(readFileSync(`${target}.tmp`, 'utf8')).toBe('new content')
  })
})
