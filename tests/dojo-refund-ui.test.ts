import { afterEach, expect, it, vi } from 'vitest'
import { renderDojoRefund } from '../src/renderer/panel/dojoRefund'
import { setLocale } from '../src/shared/i18n'

afterEach(() => { setLocale('ja'); vi.unstubAllGlobals() })
it.each(['ja', 'en'] as const)('explains the recorded one-time refund in %s', locale => {
  class Node {
    children: Array<Node | string> = []
    setAttribute() {}
    addEventListener() {}
    append(...children: Array<Node | string>) { this.children.push(...children) }
    text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
  }
  vi.stubGlobal('document', { createElement: () => new Node() }); setLocale(locale)
  const record = { revision: 2, atkLevels: 3, hpLevels: 2, totalAmount: '725', creditedAmount: '0', pendingAmount: '725' } as const
  const text = (renderDojoRefund(record, Number.MAX_SAFE_INTEGER, () => {}) as unknown as Node).text()
  expect(text).toContain('725')
  if (locale === 'en') { expect(text).toContain('never refunded twice'); expect(text).toContain('Refund remaining'); expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龠]/) }
  else { expect(text).toContain('二重に返金しません'); expect(text).toContain('返金残額') }
  expect(renderDojoRefund({ revision: 2, atkLevels: 0, hpLevels: 0, totalAmount: '0', creditedAmount: '0', pendingAmount: '0' }, 0, () => {})).toBeNull()
})
