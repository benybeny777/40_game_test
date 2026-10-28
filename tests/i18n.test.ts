import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatNumber, getLocale, onLocaleChange, registerTranslations, registerTranslationTemplates, setLocale, t, translatedLabel } from '../src/shared/i18n'
import '../src/renderer/panel/translations'

afterEach(() => { setLocale('ja'); vi.unstubAllGlobals() })
describe('locale and UI translations', () => {
  it('restores the persisted locale when a renderer starts', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en', setItem: vi.fn() })
    vi.resetModules()
    const fresh = await import('../src/shared/i18n')
    expect(fresh.getLocale()).toBe('en')
    expect(fresh.t('loading')).toBe('Loading…')
  })
  it('saves locale independently from adventure data and notifies subscribers', () => {
    const setItem = vi.fn(), listener = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    const unsubscribe = onLocaleChange(listener)
    setLocale('en'); unsubscribe(); setLocale('ja')
    expect(setItem).toHaveBeenCalledWith('hyakkiko.locale', 'en')
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
