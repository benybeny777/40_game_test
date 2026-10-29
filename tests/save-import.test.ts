import { describe, expect, it, vi } from 'vitest'
import { claimOffline, newProfile, PROFILE_VERSION, type Profile } from '../src/core/index.ts'
import { SaveImportSession, MAX_SAVE_IMPORT_BYTES } from '../src/shared/saveImport.ts'
import { GameHost } from '../src/main/loop.ts'

const now = Date.parse('2026-10-30T00:00:00Z')
const saved = () => { const profile = newProfile(new Date(now).toISOString(), 4); profile.koban = 789; return profile }
describe('confirmed save import', () => {
  it('reimporting the same old file replaces claimed rewards instead of stacking them on current assets', () => {
    const source = saved()
    source.rates.minutes = [{ koban: 120, exp: 60 }]
    source.pendingOffline = { ms: 60000, koban: 10, exp: 3, items: 0, expByJob: { samurai: 3, ninja: 3, otaku: 3 } }
    const exported = JSON.stringify(source)
    let active: Profile = newProfile(source.savedAt)
    const session = new SaveImportSession(profile => profile, profile => { active = profile }, () => {})
    const restoreAndClaim = (elapsed: number) => {
      session.confirm(session.preview(exported, now + elapsed).token)
      claimOffline(active)
      return structuredClone(active)
    }
    const once = restoreAndClaim(10 * 60000)
    expect(once.koban).toBe(source.koban + 10 + 600)
    expect(restoreAndClaim(10 * 60000)).toEqual(once)
    expect(restoreAndClaim(11 * 60000).koban).toBe(source.koban + 10 + 660)
    expect(JSON.stringify(source)).toBe(exported)
  })
  it('prepares the exported profile without mutation, commits exactly the preview and pauses', () => {
    const source = saved(), exported = JSON.stringify(source)
    const host = new GameHost(newProfile(source.savedAt), 1, { frame() {}, viewChanged() {}, save: () => true, offline() {}, failed: error => { throw error } })
    const persist = vi.fn(() => true)
    const session = new SaveImportSession(profile => host.prepareProfile(profile), candidate => { host.commitPreparedProfile(candidate, persist) }, () => {})
    const preview = session.preview(exported, now)
    expect(preview).toMatchObject({ savedAt: source.savedAt, koban: 789, currentStage: 1, depthRank: 0, party: [{ job: 'samurai', level: 1 }, { job: 'ninja', level: 1 }, { job: 'otaku', level: 1 }] })
    expect(host.profile.koban).toBe(0); expect(persist).not.toHaveBeenCalled()
    session.confirm(preview.token)
    expect(host.profile).toEqual(source); expect(host.paused).toBe(true); expect(persist).toHaveBeenCalledOnce()
    expect(JSON.stringify(source)).toBe(exported)
    expect(() => session.confirm(preview.token)).toThrow('期限切れ')
  })
  it('cancel, malformed JSON, invalid profile, future version and oversized input never commit', () => {
    const commit = vi.fn(), prepare = vi.fn(profile => profile)
    const session = new SaveImportSession(prepare, commit, () => {})
    const preview = session.preview(JSON.stringify(saved()), now)
    session.cancel(preview.token); session.cancel(preview.token)
    expect(() => session.confirm(preview.token)).toThrow('期限切れ')
    expect(() => session.preview('{broken', now)).toThrow('JSON')
    expect(() => session.preview(JSON.stringify({ ...saved(), rng: 0.5 }), now)).toThrow('bad rng')
    expect(() => session.preview(JSON.stringify({ ...saved(), version: PROFILE_VERSION + 1 }), now)).toThrow('version')
    expect(() => session.preview('あ'.repeat(MAX_SAVE_IMPORT_BYTES / 3 + 1), now)).toThrow('1MiB')
    expect(() => session.preview(null, now)).toThrow('内容')
    expect(prepare).toHaveBeenCalledOnce(); expect(commit).not.toHaveBeenCalled()
  })
  it('rechecks runtime/storage availability after preview and invalidates a failed or stale token', () => {
    let blocked = false
    const error = 'Runtime failure'
    const commit = vi.fn(), session = new SaveImportSession(profile => profile, commit, () => { if (blocked) throw new Error(error) })
    const first = session.preview(JSON.stringify(saved()), now)
    const second = session.preview(JSON.stringify(saved()), now)
    expect(() => session.confirm(first.token)).toThrow('期限切れ')
    expect(() => session.confirm(second.token)).toThrow('期限切れ')
    const third = session.preview(JSON.stringify(saved()), now)
    blocked = true
    expect(() => session.confirm(third.token)).toThrow(error)
    session.cancel(third.token)
    expect(commit).not.toHaveBeenCalled()
  })
  it('a rejected native persistence leaves the running profile unchanged', () => {
    const original = newProfile(new Date(now).toISOString()), host = new GameHost(original, 1,
      { frame() {}, viewChanged() {}, save: () => false, offline() {}, failed: error => { throw error } })
    const session = new SaveImportSession(profile => host.prepareProfile(profile), candidate => {
      if (!host.commitPreparedProfile(candidate, () => false)) throw new Error('Disk write failed')
    }, () => {})
    expect(() => session.confirm(session.preview(JSON.stringify(saved()), now).token)).toThrow('Disk write failed')
    expect(host.profile).toBe(original)
  })
})
