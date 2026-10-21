import type { Command } from '../core/index.ts'
import type { DisplaySize, PanelTab, PanelTarget, Settings } from './api.ts'

const jobs = ['samurai', 'ninja', 'jirai', 'otaku', 'pachipro']
const dojoKeys = ['atk', 'hp', 'walk']
const tabs: PanelTab[] = ['party', 'dojo', 'stage', 'dex', 'settings']
const sizes: DisplaySize[] = ['small', 'medium', 'large']
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** IPC input from renderers is untrusted: only well-formed commands reach the game. */
export function parseCommand(value: unknown): Command | null {
  if (!isObject(value) || typeof value.c !== 'string') return null
  switch (value.c) {
    case 'setLoop': return typeof value.loop === 'boolean' ? { c: 'setLoop', loop: value.loop } : null
    case 'selectStage': return Number.isInteger(value.stageNo) ? { c: 'selectStage', stageNo: value.stageNo as number } : null
    case 'reorderParty': {
      const order = value.order
      if (!Array.isArray(order) || order.length !== jobs.length || !jobs.every((id) => order.includes(id))) return null
      return { c: 'reorderParty', order: order as Extract<Command, { c: 'reorderParty' }>['order'] }
    }
    case 'buyDojo': return typeof value.key === 'string' && dojoKeys.includes(value.key) ? { c: 'buyDojo', key: value.key as Extract<Command, { c: 'buyDojo' }>['key'] } : null
    case 'claimOffline': return { c: 'claimOffline' }
    default: return null
  }
}
export function parseSettings(value: unknown): Partial<Settings> | null {
  if (!isObject(value)) return null
  const out: Partial<Settings> = {}
  if ('size' in value) { if (!sizes.includes(value.size as DisplaySize)) return null; out.size = value.size as DisplaySize }
  if ('groundBand' in value) { if (typeof value.groundBand !== 'boolean') return null; out.groundBand = value.groundBand }
  if ('fpsCap' in value) { if (value.fpsCap !== 15 && value.fpsCap !== 30) return null; out.fpsCap = value.fpsCap }
  return out
}
export function parseTarget(value: unknown): PanelTarget {
  if (!isObject(value)) return {}
  return { tab: tabs.includes(value.tab as PanelTab) ? value.tab as PanelTab : undefined,
    job: jobs.includes(value.job as string) ? value.job as PanelTarget['job'] : undefined }
}
