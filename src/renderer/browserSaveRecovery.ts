import { createGame, PROFILE_VERSION } from '../core/index.ts'
import { defaultSettings, type ShellApi } from '../shared/api'
import { BROWSER_SAVE_FORMAT, BROWSER_SAVE_KEY, browserSaveRecord } from '../shared/browserSave'
import { SaveImportSession } from '../shared/saveImport'

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export type SaveImportApi = Pick<ShellApi, 'prepareSaveImport' | 'confirmSaveImport' | 'cancelSaveImport'>

/** Explicit recovery from a failed initial load. No game loop is started and no data is changed before confirmation. */
export function browserSaveRecovery(storage: Storage, original: string | null | undefined, locale: 'ja' | 'en', reload: () => void): SaveImportApi {
  let future = false, committed = false
  if (typeof original === 'string') {
    let raw: unknown
    try { raw = JSON.parse(original) }
    catch { raw = undefined } // A corrupt JSON file may only be replaced after explicit import confirmation below.
    future = object(raw) && (Number(raw.format) > BROWSER_SAVE_FORMAT || (object(raw.profile) && Number(raw.profile.version) > PROFILE_VERSION))
  }
  const available = () => {
    if (future) throw new Error('新しいバージョンで保存されたデータです。最新版で開いてください。')
    if (original === undefined) throw new Error('保存領域にアクセスできません。ブラウザーの設定を確認してから読み直してください。')
    if (committed) throw new Error('取込は保存済みです。ページを読み直してください。')
    if (storage.getItem(BROWSER_SAVE_KEY) !== original) throw new Error('別の画面で保存データが更新されました。重複した画面を閉じ、読み直してください。')
  }
  const session = new SaveImportSession(profile => { createGame(profile, profile.rng); return profile }, profile => {
    available()
    const settings = { ...defaultSettings, locale, hideOnFullscreen: false, autoStart: false }
    const record = browserSaveRecord(profile, settings, true, Date.now())
    storage.setItem(BROWSER_SAVE_KEY, JSON.stringify(record))
    committed = true
    reload()
  }, available)
  return { prepareSaveImport: async text => session.preview(text), confirmSaveImport: async token => session.confirm(token), cancelSaveImport: async token => session.cancel(token) }
}
