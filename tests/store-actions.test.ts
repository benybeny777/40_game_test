import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalog } from '../src/commerce/catalog'
import type { StoreView } from '../src/shared/commerce'
import { setLocale } from '../src/shared/i18n'
import { renderStore } from '../src/renderer/panel/store'

class Element {
  children: Array<Element | string> = []
  dataset = {}; style = { setProperty() {} }; disabled = false; type = ''; className = ''
  listeners = new Map<string, () => void>()
  append(...children: Array<Element | string>) { this.children.push(...children) }
  setAttribute() {}
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback) }
}
const content = (node: Element): string => node.children.map(child => typeof child === 'string' ? child : content(child)).join('')
function button(root: Element, label: string): Element {
  const find = (node: Element): Element | undefined => {
    if (node.listeners.has('click') && content(node) === label) return node
    for (const child of node.children) if (typeof child !== 'string') {
      const result = find(child)
      if (result) return result
    }
  }
  const found = find(root)
  if (found) return found
  throw new Error('Missing button ' + label)
}
function store(): StoreView {
  return { mode: 'sandbox', message: '', equippedSku: null, appearance: null, pending: false,
    products: catalog.map(product => ({ ...product, price: null, owned: false, equipped: false, purchasable: true })),
    market: { available: false, message: '' } }
}
beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => new Element() })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  setLocale('ja')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Store response failures', () => {
  it('does not republish a healthy old store when purchase and readback both fail', async () => {
    const purchaseProduct = vi.fn().mockRejectedValue(new Error('purchase response lost'))
    const getStore = vi.fn().mockRejectedValue(new Error('readback offline'))
    vi.stubGlobal('window', { game: { purchaseProduct, getStore } })
    const updated = vi.fn(), toast = vi.fn(), original = store()
    const root = renderStore(original, { updated, toast }) as unknown as Element
    button(root, 'テスト取得（課金なし）').listeners.get('click')!()
    await vi.waitFor(() => expect(updated).toHaveBeenCalledOnce())
    const result = updated.mock.calls[0][0] as StoreView
    expect(result.error).toContain('操作を停止')
    expect(result.products.every(product => !product.purchasable)).toBe(true)
    expect(original.error).toBeUndefined()
    expect(purchaseProduct).toHaveBeenCalledTimes(1)
    expect(getStore).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(2)
    const stopped = renderStore(result, { updated, toast }) as unknown as Element
    expect(button(stopped, '30秒間試着').disabled).toBe(true)
    expect(button(stopped, 'ストアの状態を再確認').disabled).toBe(false)
  })
  it('reports preview-expiry refresh failure rather than swallowing it', async () => {
    vi.useFakeTimers()
    const getStore = vi.fn().mockRejectedValue(new Error('expiry refresh offline'))
    vi.stubGlobal('window', { game: { previewCosmetic: vi.fn().mockResolvedValue(true), getStore } })
    const updated = vi.fn(), toast = vi.fn()
    const root = renderStore(store(), { updated, toast }) as unknown as Element
    button(root, '30秒間試着').listeners.get('click')!()
    await vi.advanceTimersByTimeAsync(1)
    expect(updated).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30050)
    expect(updated).toHaveBeenCalledTimes(2)
    expect((updated.mock.calls[1][0] as StoreView).error).toContain('操作を停止')
    expect(getStore).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledOnce()
  })
})
