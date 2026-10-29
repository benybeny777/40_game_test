import { afterEach, describe, expect, it, vi } from 'vitest'
import { newProfile } from '../src/core/index.ts'
import { GameHost, prepareInitialProfile, type HostCallbacks } from '../src/main/loop'
import { PersistenceGuard, StoragePause } from '../src/main/persistence'

function setup() {
  const profile = newProfile('2026-10-29T00:00:00Z')
  const callbacks: HostCallbacks = { frame: vi.fn(), viewChanged: vi.fn(), save: vi.fn(() => true), offline: vi.fn(), failed: vi.fn() }
  return { profile, callbacks, host: new GameHost(profile, 1, callbacks) }
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
describe('native simulation failure boundary', () => {
  it('stops a failed polling tick, preserves its cause and never retries or autosaves the partial state', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setInterval', 'clearInterval'] })
    const { host, callbacks } = setup(), error = new Error('frame serialization failed')
    vi.mocked(callbacks.frame).mockImplementation(() => { throw error })
    host.start(); host.start(); vi.advanceTimersByTime(1000)
    expect(host.runtimeError).toBe(error); expect(host.paused).toBe(true)
    expect(callbacks.failed).toHaveBeenCalledExactlyOnceWith(error)
    expect(callbacks.frame).toHaveBeenCalledOnce(); expect(callbacks.save).not.toHaveBeenCalled()
    const tick = host.game.world.tick
    host.setPaused(false); host.start(); vi.advanceTimersByTime(60000)
    expect(host.game.world.tick).toBe(tick); expect(host.paused).toBe(true)
    expect(host.saveNow()).toBe(false); expect(callbacks.save).not.toHaveBeenCalled()
    expect(host.command({ c: 'setLoop', loop: true })).toEqual({ ok: false, reason: error.message })
  })
  it('rejects a command whose post-mutation notification failed and only recovers an explicit checkpoint paused', () => {
    const { host, callbacks } = setup(), checkpoint = structuredClone(host.profile), error = new Error('view update failed')
    vi.mocked(callbacks.viewChanged).mockImplementationOnce(() => { throw error })
    expect(host.command({ c: 'setLoop', loop: true })).toEqual({ ok: false, reason: error.message })
    expect(host.profile.progress.loop).toBe(true)
    expect(callbacks.save).not.toHaveBeenCalled()
    expect(callbacks.failed).toHaveBeenCalledExactlyOnceWith(error)
    host.recoverPreparedProfile(host.prepareProfile(checkpoint))
    expect(host.runtimeError).toBeUndefined(); expect(host.paused).toBe(true)
    expect(host.profile).toEqual(checkpoint); expect(host.profile.progress.loop).toBe(false)
    expect(callbacks.save).not.toHaveBeenCalled()
  })
  it('keeps startup offline rewards in the recoverable checkpoint when the initial save fails', () => {
    const original = newProfile('2026-10-29T00:00:00Z')
    original.rates.minutes = [{ koban: 120, exp: 60 }]
    const prepared = prepareInitialProfile(original, 3600000), checkpoint = structuredClone(prepared)
    expect(original.pendingOffline).toBeNull(); expect(checkpoint.pendingOffline!.koban).toBeGreaterThan(0)
    let statePaused = false
    const { callbacks } = setup()
    const host = new GameHost(prepared, 1, callbacks)
    const storagePause = new StoragePause(() => statePaused, paused => { statePaused = paused; host.setPaused(paused) })
    const write = vi.fn().mockImplementationOnce(() => { throw new Error('disk full') })
    const guard = new PersistenceGuard(write, error => storagePause.update(error))
    expect(guard.save(host.profile)).toBe(false); expect(statePaused).toBe(true)
    vi.mocked(callbacks.viewChanged).mockImplementationOnce(() => { throw new Error('late runtime error') })
    host.command({ c: 'setLoop', loop: true })
    storagePause.update(undefined)
    expect(host.paused).toBe(true)
    host.recoverPreparedProfile(host.prepareProfile(checkpoint))
    expect(host.profile.pendingOffline).toEqual(checkpoint.pendingOffline)
    expect(host.paused).toBe(true)
  })
})

it('does not report command success when the host save callback itself throws', () => {
  const { host, callbacks } = setup(), failure = new Error('unexpected save serialization failure')
  vi.mocked(callbacks.save).mockImplementation(() => { throw failure })
  expect(host.command({ c: 'setLoop', loop: true })).toEqual({ ok: false, reason: failure.message })
  expect(host.runtimeError).toBe(failure)
  expect(callbacks.failed).toHaveBeenCalledExactlyOnceWith(failure)
  expect(host.saveNow()).toBe(false)
  expect(callbacks.save).toHaveBeenCalledOnce()
})

describe('sleep recovery checkpoint ordering', () => {
  it('saves hours of offline rewards before a failing UI notification', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { host, callbacks } = setup()
    host.profile.rates.minutes = [{ koban: 120, exp: 60 }]
    let checkpoint = structuredClone(host.profile)
    vi.mocked(callbacks.save).mockImplementation((profile, reason) => {
      expect(reason).toBe('offline'); checkpoint = structuredClone(profile); return true
    })
    vi.mocked(callbacks.offline).mockImplementation(() => { throw new Error('balloon failed after resume') })
    host.start(); now = 3 * 3600000; vi.advanceTimersByTime(25)
    expect(callbacks.save).toHaveBeenCalledOnce()
    expect(checkpoint.pendingOffline!.koban).toBeGreaterThan(0)
    expect(host.runtimeError?.message).toContain('balloon failed')
    host.recoverPreparedProfile(host.prepareProfile(checkpoint))
    expect(host.profile.pendingOffline).toEqual(checkpoint.pendingOffline)
    expect(host.paused).toBe(true)
    host.stop()
  })
  it('does not publish rewards as saved when disk writing fails and keeps the old timestamp recalculable', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { host, callbacks } = setup()
    host.profile.rates.minutes = [{ koban: 120, exp: 60 }]
    const diskProfile = structuredClone(host.profile)
    let recovery = structuredClone(host.profile)
    vi.mocked(callbacks.save).mockImplementation((profile, reason) => {
      expect(reason).toBe('offline'); recovery = structuredClone(profile); return false
    })
    host.start(); now = 3 * 3600000; vi.advanceTimersByTime(25)
    expect(host.paused).toBe(true); expect(host.runtimeError).toBeUndefined()
    expect(callbacks.offline).not.toHaveBeenCalled(); expect(callbacks.viewChanged).not.toHaveBeenCalled()
    expect(host.profile.savedAt).toBe(diskProfile.savedAt)
    expect(diskProfile.pendingOffline).toBeNull()
    expect(recovery.pendingOffline!.koban).toBeGreaterThan(0)
    expect(prepareInitialProfile(diskProfile, now).pendingOffline).toEqual(recovery.pendingOffline)
    host.recoverPreparedProfile(host.prepareProfile(recovery))
    expect(host.profile.pendingOffline).toEqual(recovery.pendingOffline)
    host.stop()
  })
})

it('rejects a delayed cloud restore before persistence when runtime failure occurred in flight', async () => {
  const { host, callbacks } = setup(), checkpoint = structuredClone(host.profile)
  const remote = newProfile(checkpoint.savedAt); remote.koban = 999
  let respond!: () => void
  const response = new Promise<void>(resolve => { respond = resolve })
  const write = vi.fn(() => true)
  const inFlight = response.then(() => host.commitPreparedProfile(host.prepareProfile(remote), write))
  vi.mocked(callbacks.viewChanged).mockImplementationOnce(() => { throw new Error('fault during cloud request') })
  expect(host.command({ c: 'setLoop', loop: true }).ok).toBe(false)
  respond()
  await expect(inFlight).rejects.toThrow('fault during cloud request')
  expect(write).not.toHaveBeenCalled(); expect(host.profile.koban).toBe(checkpoint.koban)
})
