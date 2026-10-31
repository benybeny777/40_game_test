import { balance } from '../../core/data/balance.ts'
import type { Snapshot } from '../../core/sim/types.ts'

/** Every deployed ally, including a fallen front member, shares the same advance. */
export function formationAdvance(snapshot: Snapshot) {
  const ally = snapshot.units.find(unit => unit.side === 'ally')
  return ally ? ally.x + ally.slot * balance.formationGap : 0
}
export class BattleCamera {
  private previous?: Snapshot
  private from = 0
  private to = 0
  ingest(snapshot: Snapshot) {
    const old = this.previous
    const reset = !old || snapshot.tick < old.tick || snapshot.wave !== old.wave || snapshot.stageNo !== old.stageNo
      || snapshot.phase === 'walking' && old.phase !== 'walking' || snapshot.phase === 'town' && old.phase !== 'town'
    this.from = reset ? formationAdvance(snapshot) : this.to
    this.to = formationAdvance(snapshot)
    this.previous = snapshot
    return reset
  }
  at(alpha: number) { return this.from + (this.to - this.from) * Math.max(0, Math.min(1, alpha)) }
  clear() { this.previous = undefined; this.from = this.to = 0 }
}

/** Rebase only world-anchored screen points; HUD targets remain fixed. */
export function panPoints(points: Iterable<{ x: number }>, dots: number) {
  for (const point of points) point.x -= dots
}
