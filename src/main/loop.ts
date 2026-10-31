import { addOffline, advance, balance, buildView, computeOffline, createGame, runCommand, snapshot,
  type Command, type CommandResult, type Game, type Profile, type ProfileView, type SimEvent } from '../core/index.ts'
import type { Frame } from '../shared/api'
import { GAME_SPEED } from '../core/data/timing.ts'
import { accountElapsed } from '../core/game.ts'

const POLL_MS = 25
const MAX_STEPS_PER_POLL = 20
// A real-time gap this long (sleep, hibernate, debugger) is paid out as offline rewards instead of simulated.
const SLEEP_GAP_MS = 60 * 1000
const AUTOSAVE_MS = 30 * 1000

export interface HostCallbacks {
  frame(frame: Frame): void
  viewChanged(): void
  save(profile: Profile, reason: 'progress' | 'offline'): boolean
  offline(profile: Profile): void
  failed(error: Error): void
}
/** Startup rewards are part of the recoverable checkpoint, even before the first autosave. */
export function prepareInitialProfile(profile: Profile, elapsedMs: number): Profile {
  const prepared = structuredClone(profile)
  const offline = computeOffline(prepared, elapsedMs)
  if (offline) addOffline(prepared, offline)
  return prepared
}

/** Runs the deterministic simulation at a fixed 100ms tick against wall-clock time. */
export class GameHost {
  game: Game
  paused = false
  private last = performance.now()
  private accumulated = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private lastSave = performance.now()
  private readonly speed: number
  private failure: Error | undefined
  get runtimeError() { return this.failure }

  constructor(profile: Profile, seed: number, private readonly callbacks: HostCallbacks, speed = GAME_SPEED) {
    if (!Number.isFinite(speed) || speed < 1) throw new Error('Invalid game speed')
    this.game = createGame(profile, seed)
    this.speed = speed
  }
  start() {
    if (this.failure || this.timer !== undefined) return
    this.last = performance.now(); this.timer = setInterval(() => { this.attempt(() => this.poll()) }, POLL_MS)
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  get profile() { return this.game.profile }
  prepareProfile(profile: Profile): Game { return createGame(profile, profile.rng) }
  replacePreparedProfile(game: Game) {
    this.unwrap(this.attempt(() => {
      this.game = game
      this.setPaused(true)
      this.lastSave = performance.now()
      this.callbacks.viewChanged()
      this.callbacks.frame(this.frame())
    }))
  }
  /** Check terminal failure before any externally supplied persistence can replace the checkpoint. */
  commitPreparedProfile(game: Game, persist: () => boolean): boolean {
    if (this.failure) throw this.failure
    if (!persist()) return false
    this.replacePreparedProfile(game)
    return true
  }
  recoverPreparedProfile(game: Game) { this.failure = undefined; this.replacePreparedProfile(game) }
  view(): ProfileView { return this.unwrap(this.attempt(() => buildView(this.game.profile, this.game.world.loop, this.game.world.pending))) }
  frame(events: SimEvent[] = []): Frame { return this.unwrap(this.attempt(() => ({ snapshot: snapshot(this.game.world, this.game.profile.koban), events }))) }
  setPaused(paused: boolean) { this.paused = paused || Boolean(this.failure); this.accumulated = 0; this.last = performance.now() }

  command(command: Command): CommandResult {
    const attempted = this.attempt(() => {
      const result = runCommand(this.game, command)
      if (result.ok) { this.callbacks.viewChanged(); this.callbacks.frame(this.frame(result.events ?? [])); this.saveNow() }
      return result.ok ? { ok: true as const } : result
    })
    if (this.failure) return { ok: false, reason: this.failure.message }
    return attempted.ok ? attempted.value : { ok: false, reason: attempted.error.message }
  }
  saveNow(reason: 'progress' | 'offline' = 'progress') {
    const result = this.attempt(() => { this.lastSave = performance.now(); return this.callbacks.save(this.game.profile, reason) })
    const saved = result.ok && result.value
    if (!saved) this.setPaused(true)
    return saved
  }

  private attempt<T>(action: () => T): { ok: true; value: T } | { ok: false; error: Error } {
    if (this.failure) return { ok: false, error: this.failure }
    try { return { ok: true, value: action() } }
    catch (error) {
      if (!this.failure) {
        this.failure = error instanceof Error ? error : new Error(String(error), { cause: error })
        this.stop(); this.setPaused(true)
        this.callbacks.failed(this.failure)
      }
      return { ok: false, error: this.failure }
    }
  }
  private unwrap<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T {
    if (!result.ok) throw result.error
    return result.value
  }

  private poll() {
    const now = performance.now(), elapsed = now - this.last
    this.last = now
    if (this.paused) { if (now - this.lastSave > AUTOSAVE_MS) this.saveNow(); return }
    if (elapsed >= SLEEP_GAP_MS) {
      this.accumulated = 0
      const offline = computeOffline(this.game.profile, elapsed)
      if (offline) {
        addOffline(this.game.profile, offline)
        // Preserve the completed offline calculation before notifying UI, which can itself fail.
        // A failed write pauses without advancing savedAt; the caller keeps a recovery checkpoint.
        if (!this.saveNow('offline')) return
        this.callbacks.offline(this.game.profile); this.callbacks.viewChanged()
      }
      return
    }
    this.accumulated += elapsed * this.speed
    const events: SimEvent[] = []
    let steps = 0, changed = false, cleared = false
    while (this.accumulated >= balance.tickMs && steps < MAX_STEPS_PER_POLL * this.speed) {
      const result = advance(this.game, balance.tickMs / this.speed)
      events.push(...result.events)
      changed ||= result.changed; cleared ||= result.stageCleared
      this.accumulated -= balance.tickMs; steps++
    }
    if (this.accumulated >= balance.tickMs) {
      accountElapsed(this.game, this.accumulated / this.speed)
      this.accumulated = 0 // Discard simulation backlog, but retain real time in statistics and income rates.
    }
    if (!steps) return
    this.callbacks.frame(this.frame(events))
    if (changed) this.callbacks.viewChanged()
    if (cleared || now - this.lastSave > AUTOSAVE_MS) this.saveNow()
  }
}
