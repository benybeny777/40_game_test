import { deployedJobs } from '../core/data/jobs.ts'
import type { JobId, Profile } from '../core/index.ts'
import { prepareCloudRestore } from './cloudProfile.ts'

export const MAX_SAVE_IMPORT_BYTES = 1024 * 1024
export interface SaveImportPreview {
  token: string
  savedAt: string
  koban: number
  currentStage: number
  depthRank: number
  playMs: number
  party: { job: JobId; level: number }[]
}

/** Holds one validated candidate, never a filename or a renderer-supplied Profile. */
export class SaveImportSession<T> {
  private pending?: { token: string; prepared: T }
  private sequence = 0
  constructor(private readonly prepare: (profile: Profile) => T, private readonly commit: (prepared: T) => void,
    private readonly assertAvailable: () => void) {}

  preview(text: unknown, now = Date.now()): SaveImportPreview {
    this.pending = undefined
    this.assertAvailable()
    if (typeof text !== 'string') throw new Error('保存ファイルの内容を読み取れません。')
    if (text.length > MAX_SAVE_IMPORT_BYTES || new TextEncoder().encode(text).byteLength > MAX_SAVE_IMPORT_BYTES) {
      throw new Error('保存ファイルは1MiB以下にしてください。')
    }
    let raw: unknown
    try { raw = JSON.parse(text) }
    catch (error) { throw new Error(`保存ファイルのJSONを読み取れません。\n${error instanceof Error ? error.message : String(error)}`, { cause: error }) }
    const profile = prepareCloudRestore(raw, now)
    const prepared = this.prepare(profile)
    const token = String(++this.sequence)
    this.pending = { token, prepared }
    return { token, savedAt: profile.savedAt, koban: profile.koban, currentStage: profile.progress.currentStage,
      depthRank: profile.progress.depthRank, playMs: profile.stats.playMs,
      party: deployedJobs(profile.party.order).map(job => ({ job, level: profile.party.members[job].lv })) }
  }

  confirm(token: unknown): void {
    const candidate = this.pending
    this.pending = undefined
    this.assertAvailable()
    if (typeof token !== 'string' || !candidate || candidate.token !== token) throw new Error('取込の確認が期限切れです。保存ファイルを選び直してください。')
    this.commit(candidate.prepared)
  }

  cancel(token: unknown): void {
    if (typeof token !== 'string') throw new Error('取込の確認を読み取れません。')
    if (this.pending?.token === token) this.pending = undefined
  }
}
