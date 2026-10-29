import { translatedLabel } from '../shared/i18n'

/** Keep the original exception (including cause) in diagnostics and a readable detail in the UI. */
export function reportRendererError(message: string, error: unknown, translate = true): string {
  console.error(message, error)
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return `${translate ? translatedLabel(message) : message}\n${detail}`
}
