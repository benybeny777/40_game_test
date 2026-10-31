import { GAME_SPEED } from '../../core/data/timing'
import { balance } from '../../core/data/balance.ts'
import { actionTiming } from './actionPresentation'

// Readable real-time tails, independent of the fast combat simulation.
export const impactPresentation = { defeatMs: 360 * GAME_SPEED, defeatHoldMs: actionTiming.hitStopMs, criticalMs: 180 * GAME_SPEED, maxDefeats: 8, maxCriticals: 4 } as const
export function defeatPose(age: number) {
  const t = Math.max(0, Math.min(1, (age - impactPresentation.defeatHoldMs) / (impactPresentation.defeatMs - impactPresentation.defeatHoldMs)))
  return { dx: Math.round(13 * (1 - (1 - t) ** 2)), dy: -Math.round(Math.sin(t * Math.PI) * 8),
    tilt: t * 0.45, alpha: Math.max(0, 1 - Math.max(0, t - 0.35) / 0.65), flash: age >= 0 && age < impactPresentation.defeatHoldMs }
}

interface MeleeVisual {
  anim?: string; animAt: number; ranged?: boolean; normalMelee?: boolean; windupMs?: number; targetUid?: number; dashTargetX?: number
}
/** Only a normal strike (including its passive tags) can redirect the existing lunge. */
export function syncMeleeImpact(source: MeleeVisual, targetUid: number, targetX: number | undefined, tags: readonly string[] | undefined, now: number) {
  if (!source.normalMelee || source.anim !== 'attack' || source.ranged || !source.windupMs || targetX === undefined
    || tags?.some(tag => tag !== 'iai' && tag !== 'slowFollowup')
    || Math.abs(now - source.animAt - source.windupMs) > balance.tickMs * 2) return false
  source.targetUid = targetUid; source.dashTargetX = targetX; source.animAt = now - source.windupMs
  return true
}

/** Death echoes outlive snapshot removal, but never survive a resume/reset or grow unbounded. */
export class DefeatEchoes<T> {
  private entries: Array<{ uid: number; start: number; x: number; footY: number; payload: T }> = []
  add(uid: number, now: number, x: number, footY: number, payload: T) {
    this.sample(now)
    if (this.entries.some(entry => entry.uid === uid)) return
    if (this.entries.length === impactPresentation.maxDefeats) this.entries.shift()
    this.entries.push({ uid, start: now, x, footY, payload })
  }
  sample(now: number) {
    this.entries = this.entries.filter(entry => now - entry.start < impactPresentation.defeatMs)
    return this.entries.map(entry => ({ ...entry, pose: defeatPose(now - entry.start) }))
  }
  clear() { this.entries = [] }
  pan(dots: number) { for (const entry of this.entries) entry.x -= dots }
  get active() { return this.entries.length > 0 }
}

/** Six short rays around the struck sprite, never a screen-sized flash. */
export function criticalRays(age: number) {
  const t = age / impactPresentation.criticalMs
  if (t < 0 || t >= 1) return []
  return Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3 - Math.PI / 6
    const inner = 3 + t * 8, outer = inner + (1 - t) * 7
    return { x1: Math.round(Math.cos(angle) * inner), y1: Math.round(Math.sin(angle) * inner),
      x2: Math.round(Math.cos(angle) * outer), y2: Math.round(Math.sin(angle) * outer), alpha: 1 - t }
  })
}
