import type { Profile } from '../core/index.ts'
import type { Settings } from './api'

export const BROWSER_SAVE_KEY = 'hyakkiko.web.save'
export const BROWSER_SAVE_FORMAT = 1
export interface SavedBrowserGame { format: number; revision: string; profile: Profile; settings: Settings; state: { paused: boolean } }

export function browserSaveRecord(profile: Profile, settings: Settings, paused: boolean, at: number): SavedBrowserGame {
  const revision = [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16).padStart(8, '0')).join('')
  return { format: BROWSER_SAVE_FORMAT, revision, profile: { ...profile, savedAt: new Date(at).toISOString() }, settings, state: { paused } }
}
