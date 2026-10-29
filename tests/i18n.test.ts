import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatNumber, getLocale, onLocaleChange, registerTranslations, registerTranslationTemplates, setLocale, t, translatedLabel } from '../src/shared/i18n'
import '../src/renderer/panel/translations'
import '../src/shared/locales/system'
import { createBattleText } from '../src/renderer/battleText'

afterEach(() => { setLocale('ja'); vi.unstubAllGlobals() })
describe('locale and UI translations', () => {
  it('retranslates an existing battle banner and deployed party without another simulation frame', () => {
    setLocale('ja')
    const attributes: Record<string, string> = {}, dataset: Record<string, string> = {}
    const screen = { dataset, setAttribute: (key: string, value: string) => { attributes[key] = value } } as unknown as HTMLCanvasElement
    const banner = { textContent: '' } as HTMLElement
    const presentation = createBattleText(screen, banner)
    presentation.banner('差し入れ'); presentation.party(['samurai', 'bancho', 'rikishi'])
    expect(attributes['aria-label']).toContain('サムライ')
    setLocale('en'); presentation.translate()
    expect(banner.textContent).not.toMatch(/[一-龯ぁ-ゖァ-ヺ]/u)
    expect(attributes['aria-label']).toBe('Deployed: Samurai / Bancho / Sumo Wrestler')
    expect(dataset.party).toBe('samurai,bancho,rikishi')
    setLocale('ja'); presentation.translate()
    expect(banner.textContent).toBe('差し入れ')
    expect(attributes['aria-label']).toContain('サムライ')
  })
  it('retranslates active floating labels from their source and stops updating expired labels', () => {
    setLocale('ja')
    const screen = { dataset: {}, setAttribute: vi.fn() } as unknown as HTMLCanvasElement
    const banner = { textContent: '' } as HTMLElement, floating = { textContent: '' } as HTMLElement
    const presentation = createBattleText(screen, banner), forget = presentation.label(floating, '差し入れ')
    setLocale('en'); presentation.translate()
    const english = floating.textContent
    expect(english).not.toBe('差し入れ')
    forget(); setLocale('ja'); presentation.translate()
    expect(floating.textContent).toBe(english)
  })
  it('translates rare drops with marked item names through both battle banner and floating label paths', () => {
    const screen = { dataset: {}, setAttribute: vi.fn() } as unknown as HTMLCanvasElement
    const banner = { textContent: '' } as HTMLElement, floating = { textContent: '' } as HTMLElement
    const presentation = createBattleText(screen, banner)
    const source = '特上「金運招福守・改弐」'
    setLocale('en')
    presentation.banner(source); presentation.label(floating, source)
    expect(banner.textContent).toBe('Rare: Good Fortune Charm Mk II')
    expect(floating.textContent).toBe(banner.textContent)
    expect(translatedLabel('伝説の装備！ 金運招福守・改弐')).toBe('Legendary equipment! Good Fortune Charm Mk II')
    setLocale('ja'); presentation.translate()
    expect(banner.textContent).toBe(source)
    expect(floating.textContent).toBe(source)
  })
  it.each([['ja-JP', 'ja'], ['en-US', 'en'], ['fr-FR', 'en']])('uses system language %s for a fresh profile', async (language, expected) => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal('navigator', { language })
    vi.resetModules()
    expect((await import('../src/shared/i18n')).getLocale()).toBe(expected)
  })
  it('does not read browser storage when the translation runtime starts', async () => {
    const getItem = vi.fn(() => { throw new Error('blocked') })
    vi.stubGlobal('localStorage', { getItem })
    vi.stubGlobal('navigator', { language: 'en-US' })
    vi.resetModules()
    const fresh = await import('../src/shared/i18n')
    expect(fresh.getLocale()).toBe('en')
    expect(fresh.t('loading')).toBe('Loading…')
    expect(getItem).not.toHaveBeenCalled()
  })
  it('notifies subscribers without writing storage from the translation runtime', () => {
    const setItem = vi.fn(), listener = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    const unsubscribe = onLocaleChange(listener)
    setLocale('en'); unsubscribe(); setLocale('ja')
    expect(setItem).not.toHaveBeenCalled()
    expect(listener).toHaveBeenCalledExactlyOnceWith('en')
    expect(getLocale()).toBe('ja')
  })
  it('keeps language switching usable when storage is blocked', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked') } })
    expect(() => setLocale('en')).not.toThrow()
    expect(t('loading')).toBe('Loading…')
    expect(t('floor', { floor: 42 })).toBe('Basement 42')
    expect(formatNumber(12345)).toBe('12,345')
  })
  it('translates exact labels, dynamic templates and nested translated arguments without changing Japanese', () => {
    registerTranslations({ 'テスト属性': 'Test stat' })
    registerTranslationTemplates([{ ja: '例：{value}', en: 'Example: {value}' }])
    expect(translatedLabel('例：テスト属性')).toBe('例：テスト属性')
    setLocale('en')
    expect(translatedLabel('例：テスト属性')).toBe('Example: Test stat')
    expect(translatedLabel('例：first\nsecond')).toBe('Example: first\nsecond')
    expect(translatedLabel('次のLvまで 1,234')).toBe('1,234 EXP to next level')
    expect(translatedLabel('留守の2時間3分の間も、一行は旅を続けていました。')).toBe('Your party continued its journey while you were away for 2h 3m.')
    expect(translatedLabel('未知の文')).toBe('未知の文')
    expect(translatedLabel('<script>')).toBe('<script>')
    expect(translatedLabel('constructor')).toBe('constructor')
    expect(translatedLabel('toString')).toBe('toString')
  })
  it('covers store product text and critical recovery labels', () => {
    setLocale('en')
    for (const source of ['桜色の足元', '試着を取り消す', '保存を再試行', 'セーブを書き出す', '販売準備中', '控え・経験値なし（育成と装備を保持）', '戦闘参加で経験値']) {
      expect(translatedLabel(source)).not.toBe(source)
      expect(translatedLabel(source)).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
    }
  })
  it('prioritizes complete dungeon sentences over short numeric templates', () => {
    setLocale('en')
    expect(translatedLabel('古の地下墓地 ・最高到達 B1 ・ 100階踏破で次の難度へ')).toBe('Ancient Catacombs · Best B1 · Clear floor 100 to unlock the next difficulty')
    expect(translatedLabel('小判 41/分  経験値 60/分')).toBe('Koban 41/min · EXP 60/min')
    expect(translatedLabel('段階 1 / 20')).toBe('Tier 1 / 20')
  })
})
