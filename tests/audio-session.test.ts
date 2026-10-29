import { describe, expect, it, vi } from 'vitest'
import { AudioSession } from '../src/renderer/audioSession'
import { defaultSettings, type Frame, type ShellState } from '../src/shared/api'
import type { AudioStatus } from '../src/renderer/audio'

const state = (enabled = true): ShellState => ({ paused: false, visible: true, profile: 'dev', settings: { ...defaultSettings, audioEnabled: enabled },
  packaged: false, fullscreenHidden: false, fullscreenSupported: true, appearance: null })
const frame = { events: [{ t: 'drop', x: 0, rarity: 5, name: 'test' }], snapshot: {} } as Frame
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

function setup(desktop = false) {
  const target = new EventTarget() as Window
  Object.defineProperty(target, 'navigator', { value: { userActivation: { isActive: false } } })
  const doc = new EventTarget() as Document
  Object.defineProperty(doc, 'hidden', { writable: true, value: false })
  let failureHandler: (error: unknown) => void = () => { throw new Error('Missing error handler') }
  let enabled = false, runtime: AudioStatus = 'locked'
  const engine = {
    get status(): AudioStatus { return runtime === 'disposed' ? runtime : enabled ? runtime : 'off' },
    configure: vi.fn((value: ShellState['settings']) => { enabled = value.audioEnabled }),
    unlock: vi.fn(async (retry?: boolean) => { void retry; runtime = 'ready'; return true }),
    consume: vi.fn(), dispose: vi.fn(async () => { runtime = 'disposed' }),
  }
  const onError = vi.fn(), onChange = vi.fn()
  const session = new AudioSession({ desktop, window: target, document: doc, onError, onChange,
    createAudio: handler => { failureHandler = handler; return engine } })
  const fail = (error: unknown) => { runtime = 'error'; failureHandler(error) }
  return { target, doc, session, engine, onError, onChange, fail }
}

describe('shared audio host connection', () => {
  it('does not unlock browser playback from ordinary state notifications; a gesture unlocks once', async () => {
    const { session, engine, target } = setup()
    session.configure(state())
    session.configure(state())
    expect(engine.unlock).not.toHaveBeenCalled()
    target.dispatchEvent(new Event('pointerdown')); await flush()
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    target.dispatchEvent(new Event('keydown')); await flush()
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(session.view.status).toBe('ready')
    await session.dispose()
  })
  it('keeps the exact failure across unrelated state notifications and supports explicit retry', async () => {
    const { session, engine, target, fail, onError } = setup()
    session.configure(state())
    const error = new Error('Audio device failed')
    fail(error)
    session.configure({ ...state(), paused: true }); session.configure(state())
    target.dispatchEvent(new Event('pointerdown')); await flush()
    expect(session.view.error).toBe(error); expect(onError).toHaveBeenCalledWith(error)
    expect(engine.unlock).not.toHaveBeenCalled()
    expect(await session.retry()).toBe(true)
    expect(engine.unlock).toHaveBeenCalledWith(true)
    expect(session.view.error).toBeNull()
    await session.dispose()
  })
  it('uses a real OFF to ON transition as one explicit retry, including mutable host state', async () => {
    const { session, engine, fail } = setup(true), live = state()
    session.configure(live); await flush()
    fail(new Error('Denied'))
    session.configure(live); await flush()
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    live.settings.audioEnabled = false; session.configure(live)
    live.settings.audioEnabled = true; session.configure(live); await flush()
    expect(engine.unlock).toHaveBeenCalledTimes(2)
    expect(engine.unlock).toHaveBeenLastCalledWith(true)
    expect(session.view.error).toBeNull()
    await session.dispose()
  })
  it('suppresses playback and mutes scheduled sounds while paused, hidden, fullscreen or storage-blocked', async () => {
    const { session, engine, doc } = setup(true)
    session.configure(state()); await flush()
    session.consume(frame); expect(engine.consume).toHaveBeenCalledTimes(1)
    for (const next of [{ ...state(), paused: true }, { ...state(), visible: false }, { ...state(), fullscreenHidden: true }, { ...state(), storageError: 'Failed' }]) {
      session.configure(next); session.consume(frame)
      expect(engine.configure).toHaveBeenLastCalledWith({ ...next.settings, audioEnabled: false })
    }
    session.configure(state()); Object.defineProperty(doc, 'hidden', { value: true }); doc.dispatchEvent(new Event('visibilitychange'))
    session.consume(frame); expect(engine.consume).toHaveBeenCalledTimes(1)
    expect(engine.configure).toHaveBeenLastCalledWith({ ...state().settings, audioEnabled: false })
    await session.dispose()
  })
  it('preserves the controller through bfcache and removes host listeners on permanent disposal', async () => {
    const { session, engine, target } = setup(true)
    session.configure(state()); await flush()
    const pagehide = new Event('pagehide'); Object.defineProperty(pagehide, 'persisted', { value: true })
    target.dispatchEvent(pagehide); session.consume(frame)
    expect(engine.dispose).not.toHaveBeenCalled(); expect(engine.consume).not.toHaveBeenCalled()
    target.dispatchEvent(new Event('pageshow')); session.consume(frame)
    expect(engine.consume).toHaveBeenCalledTimes(1)
    const permanentHide = new Event('pagehide'); Object.defineProperty(permanentHide, 'persisted', { value: false })
    target.dispatchEvent(permanentHide); await flush()
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    target.dispatchEvent(new Event('pointerdown')); session.consume(frame)
    expect(engine.unlock).toHaveBeenCalledTimes(1); expect(engine.consume).toHaveBeenCalledTimes(1)
    expect(session.view.status).toBe('disposed')
  })
})
