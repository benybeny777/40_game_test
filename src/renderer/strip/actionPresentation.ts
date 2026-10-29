import { balance } from '../../core/data/balance.ts'
import type { Side } from '../../core/sim/types.ts'
import { gaitTiming } from './gait'
import { GAME_SPEED } from '../../core/data/timing'

// Impact readability has a real-time floor; attack and recovery motions still follow the faster game clock.
export const actionTiming = { walkFps: gaitTiming.fps, attackFps: 14, hitStopMs: 45 * GAME_SPEED, flashMs: 65 * GAME_SPEED, impactCooldownMs: 160 * GAME_SPEED, knockMs: 150, sparkMs: 115, recoveryMs: 110 } as const
export const hitFeedbackDue = (previous: number | undefined, now: number) => previous === undefined || now - previous >= actionTiming.impactCooldownMs
type Style = 'slash' | 'thrust' | 'fist' | 'palm' | 'toss' | 'spell' | 'hop' | 'fan' | 'book'
interface Motion { style: Style; reach: number; lift: number; hold: number; width: number; height: number }
const motion = (style: Style, reach: number, lift = 0, hold = 80, width = 0, height = 0): Motion => ({ style, reach, lift, hold, width, height })
const styles: Record<string, Motion> = {
  samurai: motion('slash', 8, 2, 85, 2), ninja: motion('toss', 4, 2, 65), jirai: motion('spell', 3, 2, 100),
  otaku: motion('toss', 3, 1), pachipro: motion('toss', 4, 1, 65), miko: motion('spell', 2, 2, 110),
  bancho: motion('fist', 8, 1, 80, 3), gyaru: motion('spell', 3, 1, 90), sukeban: motion('slash', 8, 2, 85, 2),
  farmer: motion('thrust', 11, 0, 95, 3), maid: motion('toss', 5, 3, 65), jiangshi: motion('hop', 7, 8, 100),
  vagabond: motion('toss', 3, 0, 85), rikishi: motion('palm', 9, 1, 100, 4, -2), sister: motion('book', 2, 2, 110),
  tono: motion('fan', 5, 3, 100, 3), gariben: motion('book', 3, 3, 110),
}
const enemyMelee = motion('fist', 5, 1, 75, 2), enemyRanged = motion('spell', 2, 1, 85)
export const normalWindupMs = () => Math.max(1, Math.ceil(balance.windupMs / balance.tickMs)) * balance.tickMs
/** Distance is in screen dots, never simulation coordinates. Stop a weapon-length before the target. */
export function meleeDashDistance(id: string, sourceX: number, targetX: number, slot: number) {
  if (!Number.isFinite(sourceX) || !Number.isFinite(targetX)) return 0
  const room = Math.max(0, Math.floor(targetX - sourceX - 18))
  return Math.min(90, room, slot === 0 ? styles[id]?.reach ?? 8 : room)
}
export function actionPose(id: string, side: Side, age: number, windupMs: number, ranged = false, dashDistance?: number) {
  const def = styles[id] ?? (ranged ? enemyRanged : enemyMelee), direction = side === 'enemy' ? -1 : 1
  const dash = side === 'ally' && !ranged && dashDistance !== undefined
  const reach = dash ? Math.max(0, Math.min(90, dashDistance)) : def.reach
  const base = { style: def.style, dx: 0, dy: 0, width: 0, height: 0, power: 0, attack: false, active: age >= 0 && age < windupMs + def.hold + actionTiming.recoveryMs }
  if (!base.active) return base
  if (age < windupMs) {
    const ready = age / Math.max(1, windupMs)
    if (dash && ready > 0.35) {
      const progress = Math.min(1, (ready - 0.35) / 0.65), power = 1 - (1 - progress) ** 2
      return { ...base, dx: Math.round(reach * power), dy: -Math.round(def.lift * power), power }
    }
    const raised = def.style === 'spell' || def.style === 'book' || def.style === 'fan'
    return { ...base, dx: -direction * Math.round(1 + ready * 2), dy: raised ? -Math.round(ready * 2) : def.style === 'hop' ? 2 : ready > 0.5 ? 1 : 0, width: -1, height: raised ? 1 : -1 }
  }
  const after = age - windupMs, striking = after < def.hold
  const power = striking ? 1 : Math.max(0, 1 - (after - def.hold) / actionTiming.recoveryMs)
  return { ...base, dx: direction * Math.round(reach * power), dy: -Math.round(def.lift * power), width: Math.round(def.width * power), height: Math.round(def.height * power), power, attack: striking }
}
export function hitRecoil(age: number, enemy: boolean, critical = false) {
  if (age < 0 || age >= actionTiming.knockMs) return 0
  return (enemy ? 1 : -1) * Math.round((critical ? 4 : enemy ? 3 : 2) * (1 - age / actionTiming.knockMs))
}
