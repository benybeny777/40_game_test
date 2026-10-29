import type { Frame, ShellState } from '../shared/api'
import { GameAudio, type AudioStatus } from './audio'

export interface AudioSessionView { status: AudioStatus; error: unknown | null }
interface AudioEngine {
  readonly status: AudioStatus
  configure(settings: ShellState['settings']): void
  unlock(retry?: boolean): Promise<boolean>
  consume(events: Frame['events']): unknown
  dispose(): Promise<void>
}
interface AudioSessionOptions {
  /** Desktop can honor an already-saved opt-in without a browser activation gesture. */
  desktop: boolean
  onChange?(view: AudioSessionView): void
  onError(error: unknown): void
  window?: Window
  document?: Document
  createAudio?(onError: (error: unknown) => void): AudioEngine
}

/** One audio owner per battle renderer. Keeps audio errors separate from save errors. */
export class AudioSession {
  private readonly audio: AudioEngine
  private readonly window: Window
  private readonly document: Document
  private state: ShellState | undefined
  private lastError: unknown | null = null
  private retryOnGesture = false
  private suspended = false
  private disposed = false
  private published: AudioSessionView | undefined
  private readonly gesture = () => { void this.activate() }
  private readonly visibility = () => this.apply()
  private readonly pageHide = (event: PageTransitionEvent) => {
    if (event.persisted) { this.suspended = true; this.apply() }
    else void this.dispose()
  }
  private readonly pageShow = () => { this.suspended = false; this.apply() }

  constructor(private readonly options: AudioSessionOptions) {
    this.window = options.window ?? window; this.document = options.document ?? document
    const onError = (error: unknown) => { this.lastError = error; options.onError(error); this.publish() }
    this.audio = options.createAudio?.(onError) ?? new GameAudio(onError)
    this.window.addEventListener('pointerdown', this.gesture)
    this.window.addEventListener('keydown', this.gesture)
    this.window.addEventListener('pagehide', this.pageHide)
    this.window.addEventListener('pageshow', this.pageShow)
    this.document.addEventListener('visibilitychange', this.visibility)
  }
  get view(): AudioSessionView { return { status: this.audio.status, error: this.lastError } }
  configure(state: ShellState) {
    if (this.disposed) return
    const wasAudible = this.audible
    const newlyEnabled = Boolean(this.state && !this.state.settings.audioEnabled && state.settings.audioEnabled)
    // Keep an immutable settings snapshot; hosts may mutate their own state object before notifying us.
    this.state = { ...state, settings: { ...state.settings } }
    if (newlyEnabled) this.retryOnGesture = true
    this.apply()
    if (this.audible && (!wasAudible || newlyEnabled)) {
      if (this.options.desktop || this.window.navigator.userActivation?.isActive) void this.activate()
    }
  }
  private get audible() {
    return Boolean(this.state && this.state.settings.audioEnabled && !this.state.paused && this.state.visible && !this.state.fullscreenHidden && !this.state.storageError && !this.document.hidden && !this.suspended && !this.disposed)
  }
  private apply() {
    if (!this.state || this.disposed) return
    this.audio.configure({ ...this.state.settings, audioEnabled: this.audible })
    this.publish()
  }
  private publish() {
    const next = this.view
    if (next.status === this.published?.status && next.error === this.published?.error) return
    this.published = next; this.options.onChange?.(next)
  }
  private async activate(): Promise<boolean> {
    if (!this.audible) return false
    const retry = this.retryOnGesture
    this.retryOnGesture = false
    if (this.audio.status === 'ready') return true
    if (this.audio.status === 'error' && !retry) return false
    const ok = await this.audio.unlock(retry)
    if (ok) this.lastError = null
    this.publish()
    return ok
  }
  /** Connect only to an explicit retry button/gesture. An OFF→ON setting change also arms one retry. */
  async retry(): Promise<boolean> {
    if (!this.audible) return false
    this.retryOnGesture = true
    return this.activate()
  }
  consume(frame: Frame) {
    if (this.audible) this.audio.consume(frame.events)
  }
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.window.removeEventListener('pointerdown', this.gesture)
    this.window.removeEventListener('keydown', this.gesture)
    this.window.removeEventListener('pagehide', this.pageHide)
    this.window.removeEventListener('pageshow', this.pageShow)
    this.document.removeEventListener('visibilitychange', this.visibility)
    await this.audio.dispose()
    this.publish()
  }
}
