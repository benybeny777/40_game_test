import { resolve } from 'node:path'

/** A notification failure must never change whether the data write actually succeeded. */
export class PersistenceGuard<T> {
  error: string | undefined
  constructor(private readonly write: (value: T) => void, private readonly changed: (error?: string) => void) {}
  private notify(error?: string) { try { if (error === undefined) this.changed(); else this.changed(error) } catch { /* Presentation cannot change the durable write result. */ } }
  save(value: T): boolean {
    try { this.write(value) } catch (error) {
      this.error = (error instanceof Error ? error.message : String(error)) || 'Save failed'
      this.notify(this.error)
      return false
    }
    if (this.error !== undefined) { this.error = undefined; this.notify() }
    return true
  }
}

/** Storage recovery restores the previous user pause choice, rather than silently starting a paused game. */
export class StoragePause {
  private previous: boolean | undefined
  constructor(private readonly getPaused: () => boolean, private readonly setPaused: (paused: boolean) => void) {}
  update(error?: string) {
    if (error !== undefined) {
      if (this.previous === undefined) this.previous = this.getPaused()
      this.setPaused(true)
    } else if (this.previous !== undefined) {
      const paused = this.previous; this.previous = undefined; this.setPaused(paused)
    }
  }
}

/** Persist before exposing a settings change; failed writes republish the committed state to undo optimistic UI. */
export function commitSettings<T extends object>(current: T, patch: Partial<T>, write: (settings: T) => void, failed: () => void): T {
  const candidate = { ...current, ...patch }
  try { write(candidate) } catch (error) { try { failed() } catch { /* Keep the original write error. */ } throw error }
  return candidate
}

/** Caller prevents the quit event first. A rejected/failed quit always restores the stopped host timer. */
export function confirmSavedQuit(actions: { stop(): void; save(): boolean; choose(): number; export(): void; restart(): void }): boolean {
  let approved = false
  actions.stop()
  try {
    if (actions.save()) { approved = true; return true }
    const choice = actions.choose()
    if (choice === 2) { approved = true; return true }
    if (choice === 1) actions.export()
    return false
  } finally { if (!approved) actions.restart() }
}

/** Export is a recovery copy, never a bypass around protected primary/previous/settings writes. */
export function isProtectedExport(destination: string, protectedPaths: readonly string[]): boolean {
  const normalized = resolve(destination).toLowerCase()
  return protectedPaths.some(path => {
    const target = resolve(path).toLowerCase()
    return normalized === target || normalized === target + '.tmp' || normalized === target + '.lock'
  })
}
