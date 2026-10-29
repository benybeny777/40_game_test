import { afterEach, describe, expect, it, vi } from 'vitest'
import { newProfile, PROFILE_VERSION } from '../src/core/index.ts'
import { BROWSER_SAVE_KEY } from '../src/shared/browserSave'
import { browserSaveRecovery } from '../src/renderer/browserSaveRecovery'
import { MemoryStorage } from './helpers/memoryStorage'

const incoming = () => { const profile = newProfile(new Date().toISOString()); profile.koban = 789; return JSON.stringify(profile) }
afterEach(() => vi.unstubAllGlobals())
describe('explicit bootstrap save recovery', () => {
  it('keeps corrupt bytes on preview/cancel, then writes a paused valid record and reloads on confirmation', async () => {
    const storage = new MemoryStorage(), broken = '{original broken data', reload = vi.fn()
    storage.setItem(BROWSER_SAVE_KEY, broken)
    const api = browserSaveRecovery(storage, broken, 'en', reload)
    const preview = await api.prepareSaveImport(incoming())
    expect(storage.getItem(BROWSER_SAVE_KEY)).toBe(broken); expect(reload).not.toHaveBeenCalled()
    await api.cancelSaveImport(preview.token)
    await expect(api.confirmSaveImport(preview.token)).rejects.toThrow('期限切れ')
    await api.confirmSaveImport((await api.prepareSaveImport(incoming())).token)
    const record = JSON.parse(storage.getItem(BROWSER_SAVE_KEY)!)
    expect(record.profile.koban).toBe(789); expect(record.profile.version).toBe(PROFILE_VERSION)
    expect(record.state.paused).toBe(true); expect(record.settings.locale).toBe('en')
    expect(reload).toHaveBeenCalledOnce()
  })
  it.each(['profile', 'envelope'] as const)('never replaces a newer %s, even with a valid imported file', async kind => {
    const storage = new MemoryStorage(), newer = JSON.stringify({ format: kind === 'envelope' ? 2 : 1, profile: { version: kind === 'profile' ? PROFILE_VERSION + 1 : PROFILE_VERSION } })
    storage.setItem(BROWSER_SAVE_KEY, newer)
    const api = browserSaveRecovery(storage, newer, 'ja', vi.fn())
    await expect(api.prepareSaveImport(incoming())).rejects.toThrow('新しいバージョン')
    expect(storage.getItem(BROWSER_SAVE_KEY)).toBe(newer)
  })
  it.each(['quota', 'conflict', 'invalid'] as const)('keeps existing storage on %s failure', async cause => {
    const storage = new MemoryStorage(), broken = '{broken', reload = vi.fn()
    storage.setItem(BROWSER_SAVE_KEY, broken)
    const api = browserSaveRecovery(storage, broken, 'ja', reload)
    if (cause === 'invalid') {
      await expect(api.prepareSaveImport('{bad')).rejects.toThrow('JSON')
      expect(storage.getItem(BROWSER_SAVE_KEY)).toBe(broken)
    } else {
      const preview = await api.prepareSaveImport(incoming())
      if (cause === 'quota') storage.failWrites = true
      else storage.setItem(BROWSER_SAVE_KEY, 'another tab data')
      const before = storage.getItem(BROWSER_SAVE_KEY)
      await expect(api.confirmSaveImport(preview.token)).rejects.toThrow()
      expect(storage.getItem(BROWSER_SAVE_KEY)).toBe(before)
    }
    expect(reload).not.toHaveBeenCalled()
  })
  it('does not treat an inaccessible store as a new empty save', async () => {
    const api = browserSaveRecovery(new MemoryStorage(), undefined, 'ja', vi.fn())
    await expect(api.prepareSaveImport(incoming())).rejects.toThrow('保存領域')
  })
})
