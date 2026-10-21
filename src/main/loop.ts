import { addOffline, advance, balance, buildView, computeOffline, createGame, runCommand, snapshot,
  type Command, type CommandResult, type Game, type Profile, type ProfileView, type SimEvent } from '../core/index.ts'
import type { Frame } from '../shared/api'

const POLL_MS = 25
const MAX_STEPS_PER_POLL = 20
// A real-time gap this long (sleep, hibernate, debugger) is paid out as offline rewards instead of simulated.
const SLEEP_GAP_MS = 60 * 1000
const AUTOSAVE_MS = 30 * 1000

export interface HostCallbacks {
  frame(frame: Frame): void
  viewChanged(): void
  save(profile: Profile): void
  offline(profile: Profile): void
}
/** Runs the deterministic simulation at a fixed 100ms tick against wall-clock time. */
export class GameHost {
  readonly game: Game
  paused = false
  private last = performance.now()
  private accumulated = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private lastSave = performance.now()
  private readonly speed: number

  constructor(profile: Profile, seed: number, private readonly callbacks: HostCallbacks, speed = 1) {
    this.game = createGame(profile, seed)
    this.speed = speed
  }
  start() { this.last = performance.now(); this.timer = setInterval(() => this.poll(), POLL_MS) }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  get profile() { return this.game.profile }
  view(): ProfileView { return buildView(this.game.profile, this.game.world.loop) }
  frame(events: SimEvent[] = []): Frame { return { snapshot: snapshot(this.game.world, this.game.profile.koban), events } }
  setPaused(paused: boolean) { this.paused = paused; this.accumulated = 0; this.last = performance.now() }

  command(command: Command): CommandResult {
    const result = runCommand(this.game, command)
    if (result.ok) { this.callbacks.viewChanged(); this.callbacks.frame(this.frame(result.events ?? [])); this.saveNow() }
    return result.ok ? { ok: true } : result
  }
  saveNow() { this.lastSave = performance.now(); this.callbacks.save(this.game.profile) }

  private poll() {
    const now = performance.now(), elapsed = now - this.last
    this.last = now
    if (this.paused) { if (now - this.lastSave > AUTOSAVE_MS) this.saveNow(); return }
    if (elapsed >= SLEEP_GAP_MS) {
      const offline = computeOffline(this.game.profile, elapsed)
      if (offline) { addOffline(this.game.profile, offline); this.callbacks.offline(this.game.profile); this.callbacks.viewChanged() }
      return
    }
    this.accumulated += elapsed * this.speed
    const events: SimEvent[] = []
    let steps = 0, changed = false, cleared = false
    while (this.accumulated >= balance.tickMs && steps < MAX_STEPS_PER_POLL * this.speed) {
      const result = advance(this.game)
      events.push(...result.events)
      changed ||= result.changed; cleared ||= result.stageCleared
      this.accumulated -= balance.tickMs; steps++
    }
    if (this.accumulated >= balance.tickMs) this.accumulated = 0     // Too far behind: drop the backlog rather than spiral.
    if (!steps) return
    this.callbacks.frame(this.frame(events))
    if (changed) this.callbacks.viewChanged()
    if (cleared || now - this.lastSave > AUTOSAVE_MS) this.saveNow()
  }
}
