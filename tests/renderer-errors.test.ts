import { afterEach, expect, it, vi } from 'vitest'
import { reportRendererError } from '../src/renderer/errors'
import { setLocale, translatedLabel } from '../src/shared/i18n'
import '../src/shared/locales/system'

afterEach(() => { vi.restoreAllMocks(); setLocale('ja') })

it('keeps the original cause and translates persisted error context at display time', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const cause = new Error('storage denied')
  const error = new Error('write failed', { cause })
  const message = '言語設定を保存できませんでした。'
  setLocale('en')
  const stored = reportRendererError(message, error, false)
  expect(stored).toBe(`${message}\nError: write failed`)
  expect(log).toHaveBeenCalledWith(message, error)
  expect(error.cause).toBe(cause)
  expect(translatedLabel(stored)).toBe(`${translatedLabel(message)}\nError: write failed`)
  setLocale('ja')
  expect(translatedLabel(stored)).toBe(stored)
})
