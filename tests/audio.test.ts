import { describe, expect, it, vi } from 'vitest'
import type { SimEvent } from '../src/core/index.ts'
import { defaultSettings } from '../src/shared/api'
import { parseSettings } from '../src/shared/validate'
import { chooseAudioCue, GameAudio } from '../src/renderer/audio'

const drop = (rarity: number): SimEvent => ({ t: 'drop', rarity, x: 0, name: 'test' })
const boss: SimEvent = { t: 'phase', phase: 'stageClear', stageNo: 10, wave: 10 }
function setup() {
  const param = () => ({ setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
  const createGain = vi.fn(() => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() }))
  const createOscillator = vi.fn(() => ({ type: '', frequency: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null }))
  const context = { state: 'suspended', currentTime: 0, destination: {}, createGain, createOscillator,
    resume: vi.fn(async () => { context.state = 'running' }), close: vi.fn(async () => { context.state = 'closed' }) }
  const create = vi.fn(() => context as unknown as AudioContext), onError = vi.fn()
  const audio = new GameAudio(onError, create)
  return { audio, context, create, onError }
}

describe('restrained opt-in audio', () => {
  it('defaults to silence and never creates a context before the user enables and unlocks sound', async () => {
    const { audio, create } = setup()
    audio.configure(defaultSettings)
    expect(await audio.unlock()).toBe(false)
    expect(audio.consume([drop(5)])).toBeNull()
    expect(create).not.toHaveBeenCalled()
    audio.configure({ audioEnabled: true, audioVolume: 0.25 })
    expect(audio.consume([drop(5)])).toBeNull()
    expect(create).not.toHaveBeenCalled()
    expect(await audio.unlock()).toBe(true)
    expect(audio.status).toBe('ready')
  })
  it('selects one highest priority milestone and ignores routine attacks, loot and levels', () => {
    expect(chooseAudioCue([{ t: 'attack', uid: 1, targetUid: 2, kind: 'melee' }, drop(3), { t: 'levelUp', job: 'samurai', lv: 9 }])).toBeNull()
    expect(chooseAudioCue([{ t: 'levelUp', job: 'samurai', lv: 10 }])).toBe('level')
    expect(chooseAudioCue([boss, drop(4), drop(5)])).toBe('mythic')
    expect(chooseAudioCue([boss])).toBe('boss')
  })
  it('caps overlapping notifications and rolling-hour events, without queuing old rewards', async () => {
    const { audio, context } = setup()
    audio.configure({ audioEnabled: true, audioVolume: 0.25 }); await audio.unlock()
    expect(audio.consume([drop(5), boss], 0)).toBe('mythic')
    expect(context.createOscillator).toHaveBeenCalledTimes(4)
    expect(audio.consume([drop(4)], 9999)).toBeNull()
    for (let index = 1; index < 10; index++) expect(audio.consume([boss], index * 10000)).toBe('boss')
    expect(audio.consume([drop(5)], 100000)).toBeNull()
    expect(audio.consume([], 3600000)).toBeNull()
    expect(audio.consume([drop(4)], 3600000)).toBe('legendary')
  })
  it('mutes existing notes immediately and releases resources on disposal', async () => {
    const { audio, context } = setup()
    audio.configure({ audioEnabled: true, audioVolume: 0.25 }); await audio.unlock()
    audio.consume([drop(5)], 0)
    audio.configure({ audioEnabled: false, audioVolume: 0.25 })
    expect(context.createGain.mock.results[0].value.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    expect(audio.consume([drop(5)], 20000)).toBeNull()
    await audio.dispose(); await audio.dispose()
    expect(context.close).toHaveBeenCalledTimes(1)
    expect(context.createOscillator.mock.results.every(result => result.value.disconnect.mock.calls.length === 1)).toBe(true)
    expect(audio.status).toBe('disposed')
  })
  it('reports autoplay denial with its cause and only retries after an explicit request', async () => {
    const { audio, context, onError } = setup(), failure = new DOMException('User gesture needed', 'NotAllowedError')
    context.resume.mockRejectedValueOnce(failure)
    audio.configure({ audioEnabled: true, audioVolume: 0.25 })
    expect(await audio.unlock()).toBe(false)
    expect(audio.status).toBe('error'); expect(onError).toHaveBeenCalledWith(failure)
    expect(await audio.unlock()).toBe(false)
    expect(context.resume).toHaveBeenCalledTimes(1)
    expect(await audio.unlock(true)).toBe(true)
    expect(audio.status).toBe('ready')
  })
  it('reports synthesis failure without presenting it as successful playback', async () => {
    const { audio, context, onError } = setup(), failure = new Error('Audio device lost')
    audio.configure({ audioEnabled: true, audioVolume: 0.25 }); await audio.unlock()
    context.createOscillator.mockImplementationOnce(() => { throw failure })
    expect(audio.consume([drop(5)], 0)).toBeNull()
    expect(onError).toHaveBeenCalledWith(failure); expect(audio.status).toBe('error')
    expect(context.createGain.mock.results[0].value.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    expect(await audio.unlock(true)).toBe(true)
    expect(context.createGain.mock.results[0].value.gain.setValueAtTime).toHaveBeenLastCalledWith(0.25, 0)
  })
  it('recreates a closed audio context only on an explicit retry', async () => {
    const { audio, context, create } = setup()
    audio.configure({ audioEnabled: true, audioVolume: 0.25 }); await audio.unlock()
    context.state = 'closed'
    create.mockImplementationOnce(() => { context.state = 'suspended'; return context as unknown as AudioContext })
    expect(await audio.unlock(true)).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
    expect(audio.status).toBe('ready')
  })
})

describe('audio settings boundary', () => {
  it('accepts legacy absence and valid values but rejects malformed persisted values', () => {
    expect(parseSettings({})).toEqual({})
    expect(parseSettings({ audioEnabled: true, audioVolume: 0.4 })).toEqual({ audioEnabled: true, audioVolume: 0.4 })
    for (const audioVolume of [NaN, Infinity, -0.1, 1.1, '0.5', null]) expect(parseSettings({ audioVolume })).toBeNull()
    for (const audioEnabled of [1, 'true', null]) expect(parseSettings({ audioEnabled })).toBeNull()
  })
})

it('does not play rare loot audio for a sold drop, but preserves unrelated boss cues', () => {
  const sold: SimEvent = { t: 'drop', rarity: 5, name: 'sold mythic', x: 0, sold: true,
    sale: { reason: 'capacity', name: 'sold mythic', rarity: 5, koban: 100 } }
  expect(chooseAudioCue([sold])).toBeNull()
  expect(chooseAudioCue([sold, boss])).toBe('boss')
})
