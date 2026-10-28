const controls = 'button,input,select,summary,a[href]'
/** Explicit keys identify actions that can move; structural keys cover stable secondary controls. */
export function assignFocusKeys(root: HTMLElement, page: string) {
  for (const control of root.querySelectorAll<HTMLElement>(controls)) {
    if (control.dataset.focusKey) continue
    const path: string[] = []
    let node: HTMLElement | null = control
    while (node && node !== root) {
      if (node.dataset.focusScope) { path.unshift(node.dataset.focusScope); break }
      if (['HEADER', 'NAV', 'MAIN'].includes(node.tagName)) { path.unshift(node.tagName.toLowerCase()); break }
      const parent: HTMLElement | null = node.parentElement
      path.unshift(`${node.tagName.toLowerCase()}:${parent ? [...parent.children].indexOf(node) : 0}`)
      node = parent
    }
    control.dataset.focusKey = `${page}:${path.join('/')}`
  }
}
export function capturePanelPosition(root: HTMLElement) {
  const active = document.activeElement as HTMLElement | null
  return { mainTop: root.querySelector('main')?.scrollTop ?? 0, navLeft: root.querySelector('nav')?.scrollLeft ?? 0,
    focusKey: active && root.contains(active) ? active.dataset.focusKey : undefined,
    openDetails: [...root.querySelectorAll<HTMLDetailsElement>('details[open]')].map(node => node.querySelector<HTMLElement>('summary')?.dataset.focusKey).filter((key): key is string => !!key) }
}
/** Each screen owns its vertical position; switching screens must not open the new screen at the old screen's bottom. */
export class PanelPositions {
  private page: string | undefined
  private readonly saved = new Map<string, ReturnType<typeof capturePanelPosition>>()
  select(page: string, current: ReturnType<typeof capturePanelPosition>) {
    if (this.page) this.saved.set(this.page, current)
    const previousPage = this.page; this.page = page
    if (page === previousPage) return current
    const saved = this.saved.get(page)
    return { ...current, mainTop: saved?.mainTop ?? 0, openDetails: saved?.openDetails ?? [] }
  }
}
export function restorePanelPosition(root: HTMLElement, position: ReturnType<typeof capturePanelPosition>) {
  const main = root.querySelector('main'), nav = root.querySelector('nav')
  const keyed = [...root.querySelectorAll<HTMLElement>('[data-focus-key]')]
  for (const key of position.openDetails) {
    const details = keyed.find(node => node.dataset.focusKey === key)?.closest('details')
    if (details) details.open = true
  }
  if (position.focusKey) {
    const target = keyed.find(node => node.dataset.focusKey === position.focusKey)
    if (target && !target.matches(':disabled')) target.focus({ preventScroll: true })
  }
  // Restore scroll after focus too, for engines that still scroll a newly focused control.
  if (main) main.scrollTop = position.mainTop
  if (nav) nav.scrollLeft = position.navLeft
}
