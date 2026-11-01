import type { Command } from '../core/index.ts'
import { partyOrder } from '../core/data/jobs.ts'
import { attributeKeys } from '../core/data/attributes.ts'
import { rarities } from '../core/data/items.ts'
import type { DisplaySize, PanelTab, PanelTarget, Settings } from './api.ts'

const jobs: readonly string[] = partyOrder
const dojoKeys = ['atk', 'hp', 'walk', 'drop', 'offline']
const slotIds = ['weapon', 'armor', 'charm']
const isRarity = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) < rarities.length
const isId = (value: unknown): value is string => typeof value === 'string' && /^i\d{1,9}$/.test(value)
const tabs: PanelTab[] = ['party', 'gear', 'dojo', 'stage', 'dex', 'store', 'help', 'settings']
const sizes: DisplaySize[] = ['small', 'medium', 'large']
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** IPC input from renderers is untrusted: only well-formed commands reach the game. */
export function parseCommand(value: unknown): Command | null {
  if (!isObject(value) || typeof value.c !== 'string') return null
  switch (value.c) {
    case 'setLoop': return typeof value.loop === 'boolean' ? { c: 'setLoop', loop: value.loop } : null
    case 'returnTown': return { c: 'returnTown' }
    case 'selectStage': return Number.isSafeInteger(value.stageNo) && (value.depthRank === undefined || [0, 1, 2].includes(value.depthRank as number))
      ? { c: 'selectStage', stageNo: value.stageNo as number, depthRank: value.depthRank as 0 | 1 | 2 | undefined } : null
    case 'reorderParty': {
      const order = value.order
      if (!Array.isArray(order) || order.length !== jobs.length || !jobs.every((id) => order.includes(id))) return null
      return { c: 'reorderParty', order: order as Extract<Command, { c: 'reorderParty' }>['order'] }
    }
    case 'buyDojo': return typeof value.key === 'string' && dojoKeys.includes(value.key) ? { c: 'buyDojo', key: value.key as Extract<Command, { c: 'buyDojo' }>['key'] } : null
    case 'claimOffline': return { c: 'claimOffline' }
    case 'claimDojoRefund': return { c: 'claimDojoRefund' }
    case 'allocateStats': return jobs.includes(value.job as string) && attributeKeys.includes(value.key as typeof attributeKeys[number]) && Number.isSafeInteger(value.points) && (value.points as number) > 0
      ? { c: 'allocateStats', job: value.job as Extract<Command, { c: 'allocateStats' }>['job'], key: value.key as typeof attributeKeys[number], points: value.points as number } : null
    case 'setAutoStats': return jobs.includes(value.job as string) && typeof value.enabled === 'boolean'
      ? { c: 'setAutoStats', job: value.job as Extract<Command, { c: 'setAutoStats' }>['job'], enabled: value.enabled } : null
    case 'resetStats': return jobs.includes(value.job as string) ? { c: 'resetStats', job: value.job as Extract<Command, { c: 'resetStats' }>['job'] } : null
    case 'equip':
      return jobs.includes(value.job as string) && slotIds.includes(value.slot as string) && (value.itemId === null || isId(value.itemId))
        ? { c: 'equip', job: value.job as Extract<Command, { c: 'equip' }>['job'], slot: value.slot as Extract<Command, { c: 'equip' }>['slot'], itemId: value.itemId as string | null } : null
    case 'sell': return Array.isArray(value.itemIds) && value.itemIds.length <= 200 && value.itemIds.every(isId) ? { c: 'sell', itemIds: value.itemIds as string[] } : null
    case 'sellAll': return isRarity(value.maxRarity) ? { c: 'sellAll', maxRarity: value.maxRarity as Extract<Command, { c: 'sellAll' }>['maxRarity'] } : null
    case 'lock': return isId(value.itemId) && typeof value.locked === 'boolean' ? { c: 'lock', itemId: value.itemId, locked: value.locked } : null
    case 'markItemSeen': return isId(value.itemId) ? { c: 'markItemSeen', itemId: value.itemId } : null
    case 'markSeen': return { c: 'markSeen' }
    case 'setOptions': {
      const out: Extract<Command, { c: 'setOptions' }> = { c: 'setOptions' }
      if ('autoEquip' in value) { if (typeof value.autoEquip !== 'boolean') return null; out.autoEquip = value.autoEquip }
      if ('autoSellMaxRarity' in value) { if (value.autoSellMaxRarity !== null && !isRarity(value.autoSellMaxRarity)) return null; out.autoSellMaxRarity = value.autoSellMaxRarity as Extract<Command, { c: 'setOptions' }>['autoSellMaxRarity'] }
      return out
    }
    default: return null
  }
}
export function parseSettings(value: unknown): Partial<Settings> | null {
  if (!isObject(value)) return null
  const out: Partial<Settings> = {}
  if ('locale' in value) { if (value.locale !== 'ja' && value.locale !== 'en') return null; out.locale = value.locale }
  if ('size' in value) { if (!sizes.includes(value.size as DisplaySize)) return null; out.size = value.size as DisplaySize }
  if ('groundBand' in value) { if (typeof value.groundBand !== 'boolean') return null; out.groundBand = value.groundBand }
  if ('hideOnFullscreen' in value) { if (typeof value.hideOnFullscreen !== 'boolean') return null; out.hideOnFullscreen = value.hideOnFullscreen }
  if ('autoStart' in value) { if (typeof value.autoStart !== 'boolean') return null; out.autoStart = value.autoStart }
  if ('audioEnabled' in value) { if (typeof value.audioEnabled !== 'boolean') return null; out.audioEnabled = value.audioEnabled }
  if ('audioVolume' in value) { if (typeof value.audioVolume !== 'number' || !Number.isFinite(value.audioVolume) || value.audioVolume < 0 || value.audioVolume > 1) return null; out.audioVolume = value.audioVolume }
  if ('fpsCap' in value) { if (value.fpsCap !== 15 && value.fpsCap !== 30) return null; out.fpsCap = value.fpsCap }
  return out
}
export function parseTarget(value: unknown): PanelTarget {
  if (!isObject(value)) return {}
  return { tab: tabs.includes(value.tab as PanelTab) ? value.tab as PanelTab : undefined,
    job: jobs.includes(value.job as string) ? value.job as PanelTarget['job'] : undefined }
}
