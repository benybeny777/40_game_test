export type BattleTone = 'info' | 'combo' | 'boss' | 'good' | 'loot' | 'bad'
const priority: Record<BattleTone, number> = { info: 0, combo: 1, good: 2, loot: 3, boss: 4, bad: 5 }
const earned = (tone: BattleTone | undefined) => tone === 'good' || tone === 'loot'

/** Keep a warning readable; retain only the most important waiting notice. */
export function createBattleNotice(show: (text: string, tone: BattleTone) => void, hide: () => void, duration = 1800) {
  let active: BattleTone | undefined
  let waiting: { text: string; tone: BattleTone } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let scene: string | undefined
  let lastTick: number | undefined
  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = undefined; active = undefined; waiting = undefined; hide()
  }
  const display = (text: string, tone: BattleTone) => {
    if (timer) clearTimeout(timer)
    active = tone
    show(text, tone)
    timer = setTimeout(() => {
      active = undefined
      const next = waiting
      waiting = undefined
      if (next) display(next.text, next.tone)
      else hide()
    }, tone === 'info' || tone === 'combo' ? Math.min(duration, 1000) : duration)
  }
  const notice = (text: string, tone: BattleTone = 'info') => {
    if (active !== undefined && (priority[tone] < priority[active] || active === 'loot' && tone === 'loot')) {
      // A normal skill/arrival is only meaningful now, never after an old warning.
      if (tone === 'info' || tone === 'combo') return
      if (!waiting || priority[tone] >= priority[waiting.tone]) waiting = { text, tone }
      return
    }
    // A new warning/outcome supersedes queued skill chatter from the old moment.
    if (priority[tone] >= priority.boss && waiting?.tone !== 'loot') waiting = undefined
    display(text, tone)
  }
  return Object.assign(notice, { clear,
    advance(snapshot: Pick<Snapshot, 'tick' | 'depthRank' | 'stageNo' | 'wave' | 'phase'>) {
      const next = `${snapshot.depthRank}:${snapshot.stageNo}:${snapshot.wave}:${snapshot.phase}`
      if (lastTick !== undefined && snapshot.tick < lastTick) clear()
      else if (scene !== undefined && scene !== next && !earned(active)) {
        // A kill/drop result belongs to the player, even after the wave ends.
        // Only an obsolete warning or routine combat line expires at the boundary.
        const reward = earned(waiting?.tone) ? waiting : undefined
        clear()
        if (reward) display(reward.text, reward.tone)
      }
      scene = next; lastTick = snapshot.tick
    },
  })
}
import type { Snapshot } from '../core/sim/types'
