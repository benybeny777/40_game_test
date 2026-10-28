import { translatedLabel } from '../../shared/i18n'

type Child = Node | string | null | undefined | false
/** All panel text and accessibility labels cross the same translation and text-only DOM boundary. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value as EventListener)
    else if (key === 'class') element.className = String(value)
    else element.setAttribute(key, value === true ? '' : ['title', 'aria-label', 'placeholder'].includes(key) ? translatedLabel(String(value)) : String(value))
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(typeof child === 'string' ? translatedLabel(child) : child)
  return element
}
export function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  return h(tag, { class: className }, text)
}
