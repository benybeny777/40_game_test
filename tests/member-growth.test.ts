import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { balance } from '../src/core/data/balance'
import { attributeBalance } from '../src/core/data/attributes'
import { renderMemberGrowth, renderMemberLevel } from '../src/renderer/panel/memberGrowth'
import { setLocale } from '../src/shared/i18n'

class Node {
  children: Array<Node | string> = []; attributes: Record<string, string> = {}
  setAttribute(key: string, value: string) { this.attributes[key] = value }
  append(...children: Array<Node | string>) { this.children.push(...children) }
  text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
  all(): Node[] { return [this, ...this.children.flatMap(child => typeof child === 'string' ? [] : child.all())] }
}
const member = { lv: 9, exp: 25, expNext: 100, availablePoints: 6, active: true, fighting: true, experienceMultiplier: 2 }
const node = (element: HTMLElement) => element as unknown as Node
beforeEach(() => vi.stubGlobal('document', { createElement: () => new Node() }))
afterEach(() => { vi.unstubAllGlobals(); setLocale('ja') })

it.each(['ja', 'en'] as const)('shows the shared level cap and next-level points with current EXP (%s)', locale => {
  setLocale(locale)
  expect(node(renderMemberLevel(member)).text()).toBe(`Lv 9 / ${balance.maxLevel}`)
  const growth = node(renderMemberGrowth(member)), text = growth.text()
  expect(text).toContain('75')
  expect(text).toContain(locale === 'ja' ? `次のレベルで配分ポイント +${attributeBalance.pointsPerLevel} pt` : `Next level: +${attributeBalance.pointsPerLevel} attribute points`)
  expect(growth.all().find(element => element.attributes.role === 'progressbar')?.attributes).toMatchObject({ 'aria-valuemax': '100', 'aria-valuenow': '25' })
  if (locale === 'en') expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
})

it.each(['ja', 'en'] as const)('replaces next-level EXP and bonuses at MAX with equipment/allocation guidance (%s)', locale => {
  setLocale(locale)
  const capped = { ...member, lv: balance.maxLevel, expNext: Number.MAX_SAFE_INTEGER }
  expect(node(renderMemberLevel(capped)).text()).toContain(`Lv ${balance.maxLevel} / ${balance.maxLevel} · MAX`)
  const growth = node(renderMemberGrowth(capped)), text = growth.text()
  expect(text).toContain(locale === 'ja' ? '装備を探し' : 'Find equipment')
  expect(text).toContain(locale === 'ja' ? '未使用 6 pt' : 'Unspent: 6 pt')
  expect(text).not.toContain(locale === 'ja' ? '次のLvまで' : 'EXP to next level')
  expect(text).not.toContain(locale === 'ja' ? '育成支援' : 'training bonus')
  expect(growth.all().some(element => element.attributes.role === 'progressbar')).toBe(false)
  if (locale === 'en') expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
})

it('distinguishes actual fighters, queued companions and reserves without promising reserve experience', () => {
  setLocale('en')
  expect(node(renderMemberGrowth({ ...member, active: false, fighting: true })).text()).toContain('participating in battle')
  const queued = node(renderMemberGrowth({ ...member, fighting: false })).text()
  expect(queued).toContain('after deployment takes effect'); expect(queued).not.toContain('training bonus')
  const reserve = node(renderMemberGrowth({ ...member, active: false, fighting: false })).text()
  expect(reserve).toContain('Reserves do not gain EXP'); expect(reserve).not.toContain('training bonus')
})
