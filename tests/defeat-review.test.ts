import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildView, newProfile } from '../src/core/index'
import type { DefeatRecord } from '../src/core/progress/defeat'
import { renderDefeatReview } from '../src/renderer/panel/defeatReview'
import { setLocale } from '../src/shared/i18n'

class Node {
  children: Array<Node | string> = []
  attributes: Record<string, string> = {}
  onclick?: () => void
  setAttribute(key: string, value: string) { this.attributes[key] = value }
  addEventListener(name: string, callback: () => void) { if (name === 'click') this.onclick = callback }
  append(...values: Array<Node | string>) { this.children.push(...values) }
  text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
  find(key: string): Node | undefined {
    if (this.attributes['data-focus-key'] === key) return this
    for (const child of this.children) if (child instanceof Node) { const result = child.find(key); if (result) return result }
  }
}
afterEach(() => { setLocale('ja'); vi.unstubAllGlobals() })
describe('defeat observations and equipment choices', () => {
  it.each(['ja', 'en'] as const)('renders measured facts and sends the selected equipment slot in %s', locale => {
    vi.stubGlobal('document', { createElement: () => new Node() }); setLocale(locale)
    const view = buildView(newProfile('test'), false)
    const record: DefeatRecord = { dungeonId: 'yomi', floor: 1, depthRank: 0, wave: 1,
      combatMs: 12500, remainingEnemies: { count: 2, hpRatio: 0.25 },
      party: ['samurai', 'ninja', 'otaku'].map(job => ({ job: job as 'samurai' | 'ninja' | 'otaku', lv: 1, damageTaken: 10, fallOrder: 1, fatalSource: null })) }
    const equipment = vi.fn()
    const node = renderDefeatReview(record, { equipment, formation() {}, retry() {} }, false, view.dungeon) as unknown as Node
    expect(node.text()).toContain('12.5s'); expect(node.text()).toContain('25%')
    node.find('defeat-weapon-samurai')!.onclick!()
    node.find('defeat-gear-samurai')!.onclick!()
    expect(equipment.mock.calls).toEqual([['samurai', 'weapon'], ['samurai', 'armor']])
    if (locale === 'en') {
      expect(node.text()).toContain('Enemies remaining: 2')
      expect(node.text()).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    }
    record.combatMs = null; record.remainingEnemies = null
    const old = renderDefeatReview(record, { equipment, formation() {}, retry() {} }, false, view.dungeon) as unknown as Node
    expect(old.text()).toContain(locale === 'ja' ? '戦闘時間: 記録なし' : 'Battle time: Not recorded')
  })
})
