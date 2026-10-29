import { jobs, type JobId } from '../core/index.ts'
import { translatedLabel as tr } from '../shared/i18n'

/** Preserve source strings and job IDs so paused battle overlays can change language immediately. */
export function createBattleText(screen: HTMLCanvasElement, banner: HTMLElement) {
  let bannerSource = ''
  let partyJobs: readonly JobId[] | null = null
  const labels = new Map<HTMLElement, string>()
  function translateParty() {
    screen.setAttribute('aria-label', partyJobs === null ? tr('戦闘の読み込み中')
      : tr(`出撃中：${partyJobs.map(id => tr(jobs[id].name)).join(' / ')}`))
  }
  return {
    banner(source: string) { bannerSource = source; banner.textContent = tr(source) },
    party(ids: readonly JobId[]) {
      partyJobs = [...ids]; screen.dataset.party = ids.join(','); screen.setAttribute('role', 'img'); translateParty()
    },
    label(element: HTMLElement, source: string) {
      labels.set(element, source); element.textContent = tr(source)
      return () => labels.delete(element)
    },
    translate() {
      banner.textContent = tr(bannerSource); translateParty()
      for (const [element, source] of labels) element.textContent = tr(source)
    },
  }
}
