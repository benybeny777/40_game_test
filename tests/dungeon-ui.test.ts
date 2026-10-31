import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildView, newProfile } from '../src/core/index'
import { setLocale } from '../src/shared/i18n'
import '../src/renderer/panel/translations'
import { DungeonTravelDraft, nearbyLootFloors } from '../src/renderer/panel/dungeonTravel'
vi.mock('../src/renderer/panel/portrait', () => ({ spriteImage: vi.fn() }))
import { renderDungeon } from '../src/renderer/panel/dungeon'

class Element {
  children: Array<Element | string> = []
  attrs: Record<string, string> = {}
  handlers: Record<string, (event: unknown) => void> = {}
  className = ''; value = ''
  constructor(readonly tag: string) {}
  append(...nodes: Array<Element | string>) { this.children.push(...nodes) }
  setAttribute(key: string, value: string) { this.attrs[key] = value; if (key === 'value') this.value = value }
  addEventListener(name: string, handler: (event: unknown) => void) { this.handlers[name] = handler }
  get valueAsNumber() { return this.value === '' ? NaN : Number(this.value) }
  reportValidity() { return Number.isSafeInteger(this.valueAsNumber) && this.valueAsNumber >= Number(this.attrs.min) && this.valueAsNumber <= Number(this.attrs.max) }
  all(): Element[] { return [this, ...this.children.flatMap(child => typeof child === 'string' ? [] : child.all())] }
  text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
}
beforeEach(() => { vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) }); setLocale('ja') })
afterEach(() => { vi.unstubAllGlobals(); setLocale('ja') })
const view = () => { const v = buildView(newProfile('test'), false); v.dungeon.depth = 13; v.dungeon.best = 20; return v }
const tree = (value: HTMLElement) => value as unknown as Element
const floorInput = (root: Element) => root.all().find(node => node.attrs['data-focus-key'] === 'travel-floor')!

describe('dungeon travel and loot destinations', () => {
  it('retains a draft across focusout-driven rebuilding and submits the live input value', () => {
    const draft = new DungeonTravelDraft(), command = vi.fn(async () => {}), v = view()
    const before = tree(renderDungeon(v, command, draft)), input = floorInput(before)
    input.value = '10'; input.handlers.input({ target: input })
    const after = tree(renderDungeon(v, command, draft)), nextInput = floorInput(after)
    expect(nextInput.value).toBe('10')
    nextInput.value = '9' // Programmatic/autofill value must not leave an obsolete closure behind.
    after.all().find(node => node.tag === 'form')!.handlers.submit({ preventDefault: vi.fn() })
    expect(command).toHaveBeenCalledWith({ c: 'selectStage', stageNo: 9 })
    nextInput.value = ''
    after.all().find(node => node.tag === 'form')!.handlers.submit({ preventDefault: vi.fn() })
    expect(command).toHaveBeenCalledTimes(1)
    expect(draft.value({ ...v.dungeon, difficulty: 1, depth: 1 })).toBe('1')
  })
  it('shows authoritative queued difficulty/floor and translates every new destination message', () => {
    const profile = newProfile('test')
    const v = buildView(profile, false, { stageNo: 10, depthRank: 1 })
    expect(v.dungeon.pendingTravel).toEqual({ depth: 10, difficulty: 1 })
    expect(buildView(profile, false).dungeon.pendingTravel).toBeUndefined()
    setLocale('en')
    const root = tree(renderDungeon(v, vi.fn(async () => {})))
    expect(root.text()).toContain('Travel queued:')
    expect(root.text()).toContain('B10')
    expect(root.text()).toContain('Travel begins with the next wave.')
    expect(root.text()).toContain('More likely to find: Armor')
    expect(root.text()).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
  })
  it('offers one nearby reached floor per area and sends the selected destination', () => {
    expect(nearbyLootFloors(13, 20)).toEqual([16, 10, 13])
    expect(nearbyLootFloors(1, 1)).toEqual([1, undefined, undefined])
    const large = nearbyLootFloors(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    expect(large.every(floor => floor !== undefined && Number.isSafeInteger(floor))).toBe(true)
    const command = vi.fn(async () => {}), root = tree(renderDungeon(view(), command))
    root.all().find(node => node.attrs['data-focus-key'] === 'loot-destination-0')!.handlers.click({})
    expect(command).toHaveBeenCalledWith({ c: 'selectStage', stageNo: 16 })
  })
  it('does not restart the current wave or repeat an existing reservation, but allows departure from town', () => {
    const v = view(), command = vi.fn(async () => {})
    const root = tree(renderDungeon(v, command))
    const current = root.all().find(node => node.attrs['data-focus-key'] === 'loot-destination-2')!
    expect(current.text()).toBe('現在地')
    expect(current.attrs.disabled).toBe('')
    current.handlers.click({})
    root.all().find(node => node.tag === 'form')!.handlers.submit({ preventDefault: vi.fn() })
    expect(command).not.toHaveBeenCalled()
    v.dungeon.pendingTravel = { depth: 16, difficulty: 0 }
    const queued = tree(renderDungeon(v, command))
    queued.all().find(node => node.attrs['data-focus-key'] === 'loot-destination-0')!.handlers.click({})
    expect(command).not.toHaveBeenCalled()
    v.dungeon.pendingTravel = undefined; v.dungeon.town = true
    const town = tree(renderDungeon(v, command))
    town.all().find(node => node.attrs['data-focus-key'] === 'loot-destination-2')!.handlers.click({})
    expect(command).toHaveBeenCalledWith({ c: 'selectStage', stageNo: 13 })
  })
  it('clears only accepted travel drafts and explains the shallower equipment tradeoff in English', () => {
    const draft = new DungeonTravelDraft(), v = view()
    draft.value(v.dungeon); draft.edit('10')
    draft.completed({ ok: false, reason: 'Not unlocked' })
    expect(draft.value(v.dungeon)).toBe('10')
    draft.completed({ ok: true })
    expect(draft.value({ ...v.dungeon, depth: 11 })).toBe('11')
    setLocale('en')
    const text = tree(renderDungeon(v, vi.fn(async () => {}))).text()
    expect(text).toContain('3 floors shallower · generally lower base stats')
    expect(text).toContain('3 floors deeper · generally higher base stats')
    expect(text).toContain('Individual rolls still vary.')
    expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
  })
})
