/** Keep a panel dialog modal across live DOM replacements, including bootstrap recovery. */
export class PanelModalFocus {
  private dialog: HTMLElement | null = null
  private wasOpen = false
  private origin: HTMLElement | null = null
  private originKey: string | undefined
  private inertNodes = new Map<HTMLElement, boolean>()

  constructor(private readonly selector = '[data-panel-dialog]', private readonly escape?: () => void) {
    document.addEventListener('focusin', event => {
      if (this.active() && !this.dialog!.contains(event.target as Node)) this.focusFirst()
    })
    document.addEventListener('keydown', event => {
      if (!this.active()) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.escape?.(); return }
      if (event.key !== 'Tab') return
      const controls = this.controls()
      event.preventDefault()
      if (!controls.length) { this.dialog!.focus({ preventScroll: true }); return }
      const current = controls.indexOf(document.activeElement as HTMLElement)
      const next = current < 0 ? event.shiftKey ? controls.length - 1 : 0
        : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
      controls[next].focus({ preventScroll: true })
    }, true)
  }

  beforeRender() {
    if (this.wasOpen) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      this.origin = active; this.originKey = active.dataset.focusKey
    }
  }

  sync(root: HTMLElement) {
    for (const [node, original] of this.inertNodes) node.inert = original
    this.inertNodes.clear()
    this.dialog = root.querySelector<HTMLElement>(this.selector)
    if (this.dialog) {
      // Include mobile battle controls outside #app, not just the panel's nav/main.
      for (let node: HTMLElement | null = this.dialog; node?.parentElement; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && sibling instanceof HTMLElement) {
            this.inertNodes.set(sibling, sibling.inert); sibling.inert = true
          }
        }
        if (node.parentElement === document.body) break
      }
      if (!this.dialog.contains(document.activeElement)) this.focusFirst()
      this.wasOpen = true
    } else if (this.wasOpen) {
      this.wasOpen = false
      const keyed = this.originKey ? [...root.querySelectorAll<HTMLElement>('[data-focus-key]')].find(node => node.dataset.focusKey === this.originKey) : undefined
      const target = keyed ?? (this.origin?.isConnected ? this.origin : null) ?? root.querySelector<HTMLElement>('nav [aria-current="page"]')
      target?.focus({ preventScroll: true })
      this.origin = null; this.originKey = undefined
    }
  }

  private controls() {
    return this.dialog ? [...this.dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden) : []
  }
  private active() { return this.dialog?.isConnected && !this.dialog.closest('[inert]') }
  private focusFirst() { (this.controls()[0] ?? this.dialog)?.focus({ preventScroll: true }) }
}
