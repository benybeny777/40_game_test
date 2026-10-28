import { enemies } from '../../core/data/enemies.ts'
import { balance } from '../../core/data/balance.ts'
import { isBossFloor } from '../../core/data/dungeon.ts'
import type { Snapshot, SnapshotUnit } from '../../core/sim/types.ts'

export const enemyScale = (id: string) => id === 'bugsei_child' ? 0.6 : id === 'kyubi_phantom' ? 0.8 : 1
export function enemyRank(unit: SnapshotUnit, snapshot: Pick<Snapshot, 'stageNo' | 'wave'>): 'boss' | 'elite' | 'normal' {
  if (unit.side !== 'enemy') return 'normal'
  if (enemies[unit.defId]?.boss) return 'boss'
  return snapshot.wave === balance.waves && !isBossFloor(snapshot.stageNo) ? 'elite' : 'normal'
}
/** Integer offsets preserve the pixel grid; every motion is bounded even after a long session. */
export function enemyMotion(id: string, action: SnapshotUnit['action'], now: number, uid: number): { dx: number; dy: number } {
  const phase = now + uid * 137, moving = action === 'move'
  switch (id) {
    case 'chochin': return { dx: Math.round(Math.sin(phase / 430)), dy: Math.round(Math.sin(phase / 280) * 2) - 2 }
    case 'onibi': return { dx: Math.round(Math.sin(phase / 190)), dy: Math.round(Math.sin(phase / 170) * 2) - 3 }
    case 'bugsei': case 'bugsei_child': return { dx: Math.floor(phase / 130) % 5 === 0 ? 1 : 0, dy: Math.round(Math.sin(phase / 110) * 2) - 3 }
    case 'karakasa': return { dx: 0, dy: -Math.round(Math.abs(Math.sin(phase / 220)) * (moving ? 4 : 2)) }
    case 'bakeneko': return { dx: moving ? Math.round(Math.sin(phase / 85)) : 0, dy: moving ? -Math.round(Math.abs(Math.sin(phase / 100)) * 2) : 0 }
    case 'kappa': return { dx: 0, dy: moving ? -Math.round(Math.abs(Math.sin(phase / 240))) : 0 }
    case 'ooni': case 'manekitaisho': return { dx: 0, dy: moving ? -(Math.floor(phase / 200) % 2) : 0 }
    case 'manekimodoki': return { dx: moving ? Math.round(Math.sin(phase / 250)) : 0, dy: 0 }
    case 'popuponi': return { dx: moving ? Math.round(Math.sin(phase / 55)) : 0, dy: moving ? -(Math.floor(phase / 90) % 2) : 0 }
    case 'denno_kyubi': case 'kyubi_phantom': return { dx: 0, dy: moving ? -Math.round(Math.abs(Math.sin(phase / 190))) : 0 }
    default: return { dx: 0, dy: 0 }
  }
}

/** Round damage for display only; combat retains its own numerical precision. */
export const damageText = (amount: number) => Number.isFinite(amount) ? String(Math.max(0, Math.round(amount))) : '0'
