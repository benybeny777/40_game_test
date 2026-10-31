export type BattleTone = 'info' | 'boss' | 'good' | 'bad'
const priority: Record<BattleTone, number> = { info: 0, good: 1, boss: 2, bad: 3 }

/** Keep a warning readable; retain only the most important waiting notice. */
export function createBattleNotice(show: (text: string, tone: BattleTone) => void, hide: () => void, duration = 1800) {
  let active: BattleTone | undefined
  let waiting: { text: string; tone: BattleTone } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
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
    }, duration)
  }
  const notice = (text: string, tone: BattleTone = 'info') => {
    if (active !== undefined && priority[tone] < priority[active]) {
      if (!waiting || priority[tone] >= priority[waiting.tone]) waiting = { text, tone }
      return
    }
    // A new warning/outcome supersedes queued skill chatter from the old moment.
    if (priority[tone] >= priority.boss) waiting = undefined
    display(text, tone)
  }
  return Object.assign(notice, { clear() {
    if (timer) clearTimeout(timer)
    timer = undefined; active = undefined; waiting = undefined; hide()
  } })
}
