import { translateGameText } from './locales/en-game'
import { platformEnglish } from './locales/en-platform'

export type Locale = 'ja' | 'en'
const localeKey = 'hyakkiko.locale'
let locale: Locale = 'ja'
try { if (globalThis.localStorage?.getItem(localeKey) === 'en') locale = 'en' } catch { /* Storage can be disabled. */ }
const listeners = new Set<(locale: Locale) => void>()
export const getLocale = (): Locale => locale
export function setLocale(next: Locale) {
  if (next !== 'ja' && next !== 'en') return
  if (next === locale) return
  locale = next
  try { globalThis.localStorage?.setItem(localeKey, next) } catch { /* Keep this session usable. */ }
  for (const listener of listeners) listener(next)
}
export function onLocaleChange(listener: (locale: Locale) => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
const messages = {
  language: { ja: '言語 / Language', en: 'Language / 言語' },
  loading: { ja: '読み込み中…', en: 'Loading…' },
  floor: { ja: '地下 {floor} 階', en: 'Basement {floor}' },
} as const
export type MessageKey = keyof typeof messages
type Placeholders<S extends string> = S extends `${string}{${infer Key}}${infer Rest}` ? Key | Placeholders<Rest> : never
type MessageValues<K extends MessageKey> = Placeholders<(typeof messages)[K]['en']> extends never ? [values?: Record<string, never>] : [values: Record<Placeholders<(typeof messages)[K]['en']>, string | number>]
export function t<K extends MessageKey>(key: K, ...args: MessageValues<K>) {
  const values: Record<string, string | number> = args[0] ?? {}
  return messages[key][locale].replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match))
}
export function formatNumber(value: number, options?: Intl.NumberFormatOptions) { return new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', options).format(value) }
const translations: Record<string, string> = { ...platformEnglish }
const templates: Array<{ pattern: RegExp; keys: string[]; en: string; specificity: number }> = []
const numericPlaceholders = new Set(['n', 'h', 'm', 'base', 'points', 'max', 'best', 'gold', 'exp'])
export function registerTranslations(entries: Record<string, string>) { Object.assign(translations, entries) }
export function registerTranslationTemplates(entries: Array<{ ja: string; en: string }>) {
  for (const entry of entries) {
    const keys: string[] = []
    const parts = entry.ja.split(/(\{\w+\})/g).map(part => {
      if (/^\{\w+\}$/.test(part)) {
        const key = part.slice(1, -1); keys.push(key)
        return numericPlaceholders.has(key) ? '([+−-]?\\d+(?:[.,]\\d+)*)' : '([\\s\\S]+?)'
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    templates.push({ pattern: new RegExp(`^${parts.join('')}$`), keys, en: entry.en, specificity: entry.ja.replace(/\{\w+\}/g, '').length })
  }
  // Translate the complete structured sentence before considering shorter nested phrases.
  templates.sort((a, b) => b.specificity - a.specificity || a.keys.length - b.keys.length)
}
export function translatedLabel(source: string): string {
  if (locale === 'ja') return source
  if (Object.hasOwn(translations, source)) return translations[source]
  for (const template of templates) {
    const match = template.pattern.exec(source)
    if (match) return template.en.replace(/\{(\w+)\}/g, (token, key: string) => {
      const index = template.keys.indexOf(key)
      return index < 0 ? token : match[index + 1] === source ? translateGameText(source) : translatedLabel(match[index + 1])
    })
  }
  return translateGameText(source)
}
