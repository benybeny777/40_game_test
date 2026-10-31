import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignFocusKeys, capturePanelPosition, restorePanelPosition, PanelPositions } from '../src/renderer/panel/focus'

class Control {
  dataset: Record<string, string> = {}
  parentElement: Control | null = null
  children: Control[] = []
  scrollTop = 0; scrollLeft = 0; disabled = false; open = false
  focus = vi.fn()
  constructor(public tagName: string) {}
  append(...nodes: Control[]) { for (const node of nodes) { node.parentElement = this; this.children.push(node) } }
  matches(selector: string) { return selector === ':disabled' && this.disabled }
  closest(tag: string): Control | null { return this.tagName.toLowerCase() === tag ? this : this.parentElement?.closest(tag) ?? null }
  contains(target: Control) { return target === this || this.descendants().includes(target) }
  descendants(): Control[] { return this.children.flatMap(child => [child, ...child.descendants()]) }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null }
  querySelectorAll(selector: string): Control[] {
    return this.descendants().filter(node => selector === '[data-focus-key]' ? !!node.dataset.focusKey
      : selector === 'details[open]' ? node.tagName === 'DETAILS' && node.open
      : selector.split(',').some(tag => node.tagName.toLowerCase() === tag))
  }
}
const dom = (root: Control) => root as unknown as HTMLElement
function panel() {
  const root = new Control('DIV'), nav = new Control('NAV'), main = new Control('MAIN'), button = new Control('BUTTON')
  button.dataset.focusKey = 'nav-help'; nav.append(button); root.append(nav, main)
  return { root, nav, main, button }
}
afterEach(() => vi.unstubAllGlobals())
describe('panel keyboard focus and scroll retention', () => {
  it('remembers scroll separately per screen and preserves navigation focus', () => {
    const positions = new PanelPositions()
    const base = { mainTop: 0, navLeft: 200, focusKey: 'nav-party', openDetails: [] as string[] }
    positions.select('party', base)
    expect(positions.select('gear', { ...base, mainTop: 900, focusKey: 'nav-gear' })).toEqual({ ...base, focusKey: 'nav-gear' })
    expect(positions.select('party', { ...base, mainTop: 250 })).toEqual({ ...base, mainTop: 900 })
    expect(positions.select('party', { ...base, mainTop: 700 }).mainTop).toBe(700)
  })
  it('keeps explicit action keys and generates stable scoped keys when a member moves', () => {
    const first = panel(), scope = new Control('ARTICLE'), action = new Control('BUTTON')
    scope.dataset.focusScope = 'member-ninja'; scope.append(action); first.main.append(scope)
    assignFocusKeys(dom(first.root), 'party')
    const expected = action.dataset.focusKey
    expect(expected).toContain('member-ninja')
    expect(first.button.dataset.focusKey).toBe('nav-help')
    const next = panel(), moved = new Control('ARTICLE'), nextAction = new Control('BUTTON')
    moved.dataset.focusScope = 'member-ninja'; moved.append(nextAction)
    next.main.append(new Control('ARTICLE'), moved)
    assignFocusKeys(dom(next.root), 'party')
    expect(nextAction.dataset.focusKey).toBe(expected)
  })
  it('restores the same keyboard action and both scroll axes after rebuilding', () => {
    const before = panel(); before.main.scrollTop = 740; before.nav.scrollLeft = 185
    vi.stubGlobal('document', { activeElement: before.button })
    const saved = capturePanelPosition(dom(before.root)), next = panel()
    // Simulate an engine that scrolls despite preventScroll; restoration runs after focus.
    next.button.focus.mockImplementation(() => { next.main.scrollTop = 0; next.nav.scrollLeft = 0 })
    restorePanelPosition(dom(next.root), saved)
    expect(next.button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(next.main.scrollTop).toBe(740)
    expect(next.nav.scrollLeft).toBe(185)
  })
  it('does not steal focus from outside the panel or target a disabled action', () => {
    const before = panel()
    vi.stubGlobal('document', { activeElement: new Control('BUTTON') })
    const saved = capturePanelPosition(dom(before.root)), next = panel()
    restorePanelPosition(dom(next.root), saved)
    expect(next.button.focus).not.toHaveBeenCalled()
    next.button.disabled = true
    restorePanelPosition(dom(next.root), { ...saved, focusKey: 'nav-help' })
    expect(next.button.focus).not.toHaveBeenCalled()
  })
  it('keeps opened help disclosures expanded across periodic updates', () => {
    const before = panel(), details = new Control('DETAILS'), summary = new Control('SUMMARY')
    summary.dataset.focusKey = 'help:save-summary'; details.open = true; details.append(summary); before.main.append(details)
    vi.stubGlobal('document', { activeElement: summary })
    const saved = capturePanelPosition(dom(before.root)), next = panel(), nextDetails = new Control('DETAILS'), nextSummary = new Control('SUMMARY')
    nextSummary.dataset.focusKey = 'help:save-summary'; nextDetails.append(nextSummary); next.main.append(nextDetails)
    restorePanelPosition(dom(next.root), saved)
    expect(nextDetails.open).toBe(true)
    expect(nextSummary.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  })
  it('retains keyed gear, training and records disclosures without tying them to member cards', () => {
    const before = panel()
    const keys = ['gear-management', 'training-ninja', 'abyss-records', 'reserve-expand']
    const add = (root: Control, key: string, open = false) => {
      const details = new Control('DETAILS'), summary = new Control('SUMMARY')
      summary.dataset.focusKey = key; details.open = open; details.append(summary); root.append(details)
      return details
    }
    keys.forEach(key => add(before.main, key, true))
    add(before.main, 'closed-details')
    vi.stubGlobal('document', { activeElement: before.button })
    const saved = capturePanelPosition(dom(before.root)), next = panel()
    expect(saved.openDetails).toEqual(keys)
    const rebuilt = [...keys].reverse().map(key => add(next.main, key))
    const closed = add(next.main, 'closed-details')
    restorePanelPosition(dom(next.root), saved)
    expect(rebuilt.every(details => details.open)).toBe(true)
    expect(closed.open).toBe(false)
    rebuilt[0].open = false
    const updated = capturePanelPosition(dom(next.root))
    expect(updated.openDetails).not.toContain('reserve-expand')
  })
  it('restores expanded disclosures only for their original screen on a tab round trip', () => {
    const positions = new PanelPositions()
    const base = { mainTop: 0, navLeft: 0, openDetails: [] as string[], focusKey: undefined }
    positions.select('gear', base)
    expect(positions.select('stage', { ...base, openDetails: ['gear-management'] }).openDetails).toEqual([])
    expect(positions.select('gear', { ...base, openDetails: ['abyss-records'] }).openDetails).toEqual(['gear-management'])
    expect(positions.select('stage', { ...base, openDetails: [] }).openDetails).toEqual(['abyss-records'])
    expect(positions.select('gear', base).openDetails).toEqual([])
  })
})
