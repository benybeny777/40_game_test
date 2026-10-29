import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildView, createGame, newProfile } from '../src/core/index'
import { catalog } from '../src/commerce/catalog'
import { setLocale } from '../src/shared/i18n'
import type { StoreView } from '../src/shared/commerce'
import { h } from '../src/renderer/panel/dom'
import { renderHelp } from '../src/renderer/panel/help'
import { renderStore } from '../src/renderer/panel/store'
import { renderDex } from '../src/renderer/panel/dex'
import { SaveImportController, renderSaveImport, renderSaveImportDialog } from '../src/renderer/panel/saveImport'
import { renderAbyssRecords } from '../src/renderer/panel/abyssRecords'
import { recordAbyssClear, abyssView } from '../src/core/progress/abyss'

class TextNode {
  children: Array<TextNode | string> = []
  attributes: Record<string, string> = {}
  className = ''; dataset = {}; style = { setProperty: () => {} }
  append(...values: Array<TextNode | string>) { this.children.push(...values) }
  setAttribute(key: string, value: string) { this.attributes[key] = value }
  addEventListener() {}
}
const text = (node: TextNode): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join(' ')
const asNode = (element: HTMLElement) => element as unknown as TextNode
beforeEach(() => { vi.stubGlobal('document', { createElement: () => new TextNode() }); setLocale('en') })
afterEach(() => { setLocale('ja'); vi.unstubAllGlobals() })

describe('English panel component text', () => {
  it('shows the next Abyss goal and the recorded party in English without inventing past records', () => {
    const profile = newProfile('test')
    const portrait = () => h('span')
    const empty = text(asNode(renderAbyssRecords(abyssView(profile), portrait)))
    expect(empty).toContain('Next clear goal: B100')
    expect(empty).toContain('past parties are not reconstructed')
    recordAbyssClear(profile, 100, profile.offlineJobs)
    const recorded = text(asNode(renderAbyssRecords(abyssView(profile), portrait)))
    expect(recorded).toContain('Next clear goal: B250')
    expect(recorded).toContain('Best clear: B100')
    expect(recorded).toContain('Party that cleared B100')
    expect(recorded).toContain('Samurai')
    expect(recorded).toContain('Allocated STR 0 / DEX 0 / VIT 0 / INT 0')
    expect(recorded).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/)
  })
  it('explains save replacement and cancellation in English, including bootstrap settings recovery', () => {
    const controller = new SaveImportController({ prepareSaveImport: vi.fn(), confirmSaveImport: vi.fn(), cancelSaveImport: vi.fn() }, () => {}, true)
    controller.fileName = 'export.json'
    controller.preview = { token: 'one', savedAt: '2026-10-30T00:00:00.000Z', currentStage: 6, depthRank: 0, koban: 100, playMs: 60000, party: [{ job: 'samurai', level: 3 }] }
    const controls = text(asNode(renderSaveImport(controller)))
    const dialog = text(asNode(renderSaveImportDialog(controller)!))
    expect(controls).toContain('File limit: 1,024 KiB')
    expect(dialog).toContain('This cannot be undone')
    expect(dialog).toContain('Damaged settings are replaced')
    expect(dialog).toContain('Cancel'); expect(dialog).toContain('Samurai')
    expect(controls + dialog).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
  })
  it('uses translated text and aria labels without translating machine attributes', () => {
    const node = asNode(h('button', { title: '装備する', 'aria-label': '装備する', 'data-value': '装備する' }, '装備する', '<script>'))
    expect(node.attributes.title).toBe('Equip')
    expect(node.attributes['aria-label']).toBe('Equip')
    expect(node.attributes['data-value']).toBe('装備する')
    expect(text(node)).toBe('Equip <script>')
  })
  it('renders every help section in English', () => {
    const result = text(asNode(renderHelp()))
    expect(result).toContain('How to play')
    expect(result).toContain('Saving and recovery')
    expect(result).toContain('Steam')
    expect(result).toContain('Reserves gain no experience')
    expect(result).toContain('previously earned levels are not reduced')
    expect(result).toContain('Changing the party before claiming rewards does not transfer')
    expect(result).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
  })
  it('explains active-only experience and preservation of old levels in Japanese too', () => {
    setLocale('ja')
    const result = text(asNode(renderHelp()))
    expect(result).toContain('控えは経験値を獲得せず')
    expect(result).toContain('過去に上がったレベルは下げません')
    expect(result).not.toContain('控えも同じ経験値')
  })
  it('uses the same help structure in both languages and includes current loot, cloud and sound guidance', () => {
    const structure = (node: TextNode): unknown => ({ className: node.attributes.class ?? node.className,
      children: node.children.filter(child => typeof child !== 'string').map(child => structure(child as TextNode)) })
    const english = asNode(renderHelp()), englishText = text(english)
    expect(englishText).toContain('first clear of B1')
    expect(englishText).toContain('do not lower stats')
    expect(englishText).toContain('This is not automatic sync')
    expect(englishText).toContain('Sound is off by default')
    setLocale('ja')
    const japanese = asNode(renderHelp()), japaneseText = text(japanese)
    expect(structure(japanese)).toEqual(structure(english))
    expect(japaneseText).toContain('地下1階の初回突破')
    expect(japaneseText).toContain('能力が下がらない')
    expect(japaneseText).toContain('自動同期ではありません')
    expect(japaneseText).toContain('通知音は最初はOFF')
  })
  it('renders unavailable store products, warnings and controls in English', () => {
    const view: StoreView = { mode: 'unavailable', message: '外観を試着できます。ブラウザー版では購入・Steam取引は利用できません。',
      equippedSku: null, appearance: null, pending: true,
      products: catalog.map(product => ({ ...product, price: null, owned: false, equipped: false, purchasable: false })),
      market: { available: false, message: 'Steamのマーケット取引は、このブラウザー版では利用できません。' } }
    const result = text(asNode(renderStore(view, { updated: () => {}, toast: () => {} })))
    expect(result).toContain('Cherry blossom ground')
    expect(result).toContain('Coming soon')
    expect(result).toContain('Preview for 30 seconds')
    expect(result).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
  })
  it('renders discovered and undiscovered bestiary entries in English', () => {
    const profile = newProfile(new Date().toISOString()), game = createGame(profile, 1)
    const view = buildView(profile, game.world.loop)
    view.dex[0].seen = true
    const result = text(asNode(renderDex(view, () => new TextNode() as unknown as HTMLCanvasElement)))
    expect(result).toContain('Discovered 1 /')
    expect(result).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
  })
})
