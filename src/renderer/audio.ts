import type { SimEvent } from '../core/index.ts'
import type { Settings } from '../shared/api'

export type AudioCue = 'level' | 'boss' | 'legendary' | 'mythic'
export type AudioStatus = 'off' | 'locked' | 'ready' | 'error' | 'disposed'
const priority: Record<AudioCue, number> = { level: 1, boss: 2, legendary: 3, mythic: 4 }
const notes: Record<AudioCue, readonly number[]> = {
  level: [523.25, 659.25], boss: [392, 493.88, 587.33],
  legendary: [659.25, 830.61, 987.77], mythic: [523.25, 659.25, 783.99, 1046.5],
}
const HOUR_MS = 3600000, MIN_GAP_MS = 10000, MAX_PER_HOUR = 10

/** A batch of simultaneous rewards produces one short cue, not a chord of notifications. */
export function chooseAudioCue(events: readonly SimEvent[]): AudioCue | null {
  let best: AudioCue | null = null
  for (const event of events) {
    const cue: AudioCue | null = event.t === 'drop' && !event.sold && event.rarity >= 4 ? event.rarity >= 5 ? 'mythic' : 'legendary'
      : event.t === 'phase' && event.phase === 'stageClear' && event.stageNo % 10 === 0 ? 'boss'
      : event.t === 'levelUp' && event.lv % 10 === 0 ? 'level' : null
    if (cue && (!best || priority[cue] > priority[best])) best = cue
  }
  return best
}

/** Opt-in event sounds; no AudioContext or playback until a user gesture explicitly unlocks it. */
export class GameAudio {
  private context: AudioContext | undefined
  private master: GainNode | undefined
  private enabled = false
  private volume = 0.25
  private blocked = false
  private unlocking = false
  private disposed = false
  private readonly playedAt: number[] = []
  private readonly voices = new Map<OscillatorNode, GainNode>()
  constructor(private readonly onError: (error: unknown) => void,
    private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  get status(): AudioStatus {
    if (this.disposed) return 'disposed'
    if (!this.enabled) return 'off'
    if (this.blocked) return 'error'
    return this.context?.state === 'running' ? 'ready' : 'locked'
  }
  configure(settings: Pick<Settings, 'audioEnabled' | 'audioVolume'>) {
    if (typeof settings.audioEnabled !== 'boolean' || !Number.isFinite(settings.audioVolume) || settings.audioVolume < 0 || settings.audioVolume > 1) throw new Error('Invalid audio settings')
    if (this.disposed) return
    this.enabled = settings.audioEnabled; this.volume = settings.audioVolume
    if (this.master && this.context) this.master.gain.setValueAtTime(this.enabled ? this.volume : 0, this.context.currentTime)
  }
  /** Call directly from a trusted pointer/key gesture. retry=true is only for an explicit retry action. */
  async unlock(retry = false): Promise<boolean> {
    if (!this.enabled || this.disposed || this.unlocking || (this.blocked && !retry)) return false
    this.unlocking = true
    try {
      if (retry && this.context?.state === 'closed') {
        this.context = undefined; this.master = undefined; this.voices.clear()
      }
      if (!this.context) this.context = this.createContext()
      if (!this.master) {
        const master = this.context.createGain()
        master.gain.setValueAtTime(this.enabled ? this.volume : 0, this.context.currentTime)
        master.connect(this.context.destination)
        this.master = master
      }
      if (this.context.state !== 'running') await this.context.resume()
      if (this.disposed) return false
      if (this.context.state !== 'running') throw new Error('Audio playback was not enabled by this interaction')
      this.master.gain.setValueAtTime(this.enabled ? this.volume : 0, this.context.currentTime)
      this.blocked = false
      return true
    } catch (error) { this.fail(error); return false }
    finally { this.unlocking = false }
  }
  consume(events: readonly SimEvent[], now = performance.now()): AudioCue | null {
    if (this.status !== 'ready' || this.volume === 0) return null
    const cue = chooseAudioCue(events)
    if (!cue) return null
    while (this.playedAt.length && now - this.playedAt[0] >= HOUR_MS) this.playedAt.shift()
    if (this.playedAt.length >= MAX_PER_HOUR || (this.playedAt.length && now - this.playedAt[this.playedAt.length - 1] < MIN_GAP_MS)) return null
    try {
      this.play(cue)
      this.playedAt.push(now)
      return cue
    } catch (error) { this.fail(error); return null }
  }
  private fail(error: unknown) {
    this.blocked = true
    // A later voice can fail after earlier notes were scheduled. Silence that incomplete cue too.
    let problem = error
    try { if (this.master && this.context?.state !== 'closed') this.master.gain.setValueAtTime(0, this.context!.currentTime) }
    catch (muteError) { problem = new AggregateError([error, muteError], 'Audio playback and muting both failed') }
    this.onError(problem)
  }
  private play(cue: AudioCue) {
    const context = this.context!, master = this.master!
    const start = context.currentTime + 0.005
    notes[cue].forEach((frequency, index) => {
      const oscillator = context.createOscillator(), envelope = context.createGain()
      const at = start + index * 0.075, end = at + 0.16
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, at)
      envelope.gain.setValueAtTime(0, at)
      envelope.gain.linearRampToValueAtTime(0.18, at + 0.008)
      envelope.gain.exponentialRampToValueAtTime(0.001, end)
      oscillator.connect(envelope); envelope.connect(master)
      this.voices.set(oscillator, envelope)
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.voices.delete(oscillator) }
      oscillator.start(at); oscillator.stop(end + 0.01)
    })
  }
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    if (this.master && this.context) this.master.gain.setValueAtTime(0, this.context.currentTime)
    for (const [oscillator, envelope] of this.voices) { oscillator.disconnect(); envelope.disconnect() }
    this.voices.clear()
    if (this.context && this.context.state !== 'closed') {
      try { await this.context.close() } catch (error) { this.onError(error) }
    }
  }
}
