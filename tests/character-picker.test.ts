import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderCharacterPicker } from '../src/renderer/panel/characterPicker'
import { buildView, newProfile } from '../src/core/index'
import { setLocale } from '../src/shared/i18n'
import '../src/shared/locales/en-game'

vi.mock('../src/renderer/panel/portrait', () => ({ spriteImage: () => document.createElement('canvas') }))
class Node {
  children: Array<Node | string> = []; attributes: Record<string, string> = {}; handlers: Record<string, () => void> = {}
  constructor(readonly tag: string) {}
  setAttribute(key: string, value: string) { this.attributes[key] = value }
  addEventListener(key: string, handler: () => void) { this.handlers[key] = handler }
  append(...children: Array<Node | string>) { this.children.push(...children) }
  text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
}
beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }))
afterEach(() => { vi.unstubAllGlobals(); setLocale('ja') })

it.each(['ja', 'en'] as const)('shows every choice with translated identity, state and native keyboard buttons (%s)', locale => {
  setLocale(locale)
  const party = buildView(newProfile('test'), false).party
  const selected = party[0].job, choose = vi.fn()
  party[0].fighting = true; party[0].active = false
  party[1].fighting = false; party[1].active = true
  const before = structuredClone(party)
  const picker = renderCharacterPicker(party, selected, choose, 'equipment') as unknown as Node
  const buttons = picker.children as Node[]
  expect(buttons).toHaveLength(party.length)
  expect(buttons.every(button => button.tag === 'button' && button.attributes.type === 'button')).toBe(true)
  expect(buttons.filter(button => button.attributes['aria-pressed'] === 'true')).toEqual([buttons[0]])
  expect(buttons[0].attributes['data-focus-key']).toBe(`equipment-${selected}`)
  expect(buttons[0].text()).toContain(locale === 'ja' ? '出撃中・交代予約' : 'Deployed · Swap queued')
  expect(buttons[1].text()).toContain(locale === 'ja' ? '出撃予約' : 'Deployment queued')
  expect(picker.text()).toContain(locale === 'ja' ? '控え' : 'Reserve')
  expect(picker.text()).toContain('Lv 1')
  expect(picker.text()).toContain(locale === 'ja' ? 'サムライ' : 'Samurai')
  if (locale === 'en') expect(picker.text()).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
  buttons[1].handlers.click()
  expect(choose).toHaveBeenCalledExactlyOnceWith(party[1].job)
  expect(party).toEqual(before)
})
