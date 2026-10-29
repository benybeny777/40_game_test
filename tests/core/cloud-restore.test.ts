import { describe, expect, it } from 'vitest'
import { newProfile, PROFILE_VERSION } from '../../src/core/index.ts'
import { prepareCloudRestore } from '../../src/shared/cloudProfile.ts'
import { parseCloudCommand } from '../../src/shared/cloud.ts'
import { GameHost } from '../../src/main/loop.ts'

describe('cloud restore boundary', () => {
  it('validates before touching local data and does not mutate the remote snapshot', () => {
    const profile = newProfile('2026-10-29T00:00:00Z')
    profile.rates.minutes = [{ koban: 30, exp: 12 }]
    const restored = prepareCloudRestore(profile, Date.parse('2026-10-29T01:00:00Z'))
    expect(profile.pendingOffline).toBeNull()
    expect(restored.pendingOffline?.koban).toBeGreaterThan(0)
    expect(restored.party.members.samurai.lv).toBe(profile.party.members.samurai.lv)
  })
  it('rejects future, corrupt and invalid timestamps instead of creating a new save', () => {
    const profile = newProfile('2026-10-29T00:00:00Z')
    expect(() => prepareCloudRestore({ ...profile, version: PROFILE_VERSION + 1 })).toThrow()
    expect(() => prepareCloudRestore({ ...profile, savedAt: 'invalid' })).toThrow()
    expect(() => prepareCloudRestore({ ...profile, pendingOffline: { exp: -1 } })).toThrow()
    expect(() => prepareCloudRestore({ ...profile, rng: 0.5 })).toThrow('bad rng')
  })
  it('constructs a replacement before changing the running game, then adopts that exact prepared game', () => {
    const original = newProfile('2026-10-29T00:00:00Z')
    const callbacks = { frame() {}, viewChanged() {}, save() { return true }, offline() {}, failed(error: Error) { throw error } }
    const host = new GameHost(original, 1, callbacks)
    const invalid = { ...newProfile(original.savedAt), rng: 0.5 }
    expect(() => host.prepareProfile(invalid)).toThrow('seed must be uint32')
    expect(host.profile).toBe(original)
    expect(host.paused).toBe(false)
    const replacement = newProfile(original.savedAt)
    replacement.koban = 123
    const prepared = host.prepareProfile(replacement)
    expect(host.profile.koban).toBe(0)
    host.replacePreparedProfile(prepared)
    expect(host.game).toBe(prepared)
    expect(host.profile.koban).toBe(123)
    expect(host.paused).toBe(true)
  })
  it('requires known revisions and bounded credentials at the IPC boundary', () => {
    expect(() => parseCloudCommand({ action: 'upload' })).toThrow()
    expect(() => parseCloudCommand({ action: 'download', revision: -1 })).toThrow()
    expect(() => parseCloudCommand({ action: 'login', username: 'user', password: 'short' })).toThrow()
    expect(parseCloudCommand({ action: 'upload', revision: 0 })).toEqual({ action: 'upload', revision: 0 })
  })
})
