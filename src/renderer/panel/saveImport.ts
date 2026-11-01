import type { ShellApi } from '../../shared/api'
import { MAX_SAVE_IMPORT_BYTES, type SaveImportPreview } from '../../shared/saveImport'
import { jobs } from '../../core/data/jobs'
import { difficulties } from '../../core/data/dungeon'
import { getLocale, translatedLabel, formatNumber } from '../../shared/i18n'
import { reportRendererError } from '../errors'
import { h } from './dom'
import { PanelModalFocus } from './modalFocus'
import './translations'

export type SaveImportApi = Pick<ShellApi, 'prepareSaveImport' | 'confirmSaveImport' | 'cancelSaveImport'>
type ImportFile = Pick<File, 'name' | 'size' | 'text'>

/** Keep file selection, confirmation and failures independent of live panel rendering. */
export class SaveImportController {
  busy = false
  preview: SaveImportPreview | undefined
  fileName = ''
  message = ''
  private failure: { context: string; cause: unknown } | undefined
  constructor(private readonly api: SaveImportApi, private readonly changed: () => void, readonly resetSettings = false, private readonly restored?: () => void) {}
  get error() {
    if (!this.failure) return ''
    const { context, cause } = this.failure
    return translatedLabel(context) + '\n' + (cause instanceof Error
      ? cause.name + ': ' + translatedLabel(cause.message) : String(cause))
  }
  private fail(context: string, cause: unknown) {
    reportRendererError(context, cause, false)
    this.failure = { context, cause }
  }
  async selectFile(file: ImportFile) {
    if (this.busy || this.preview) return
    this.busy = true; this.failure = undefined; this.message = ''; this.fileName = file.name; this.changed()
    try {
      if (file.size > MAX_SAVE_IMPORT_BYTES) throw new Error('セーブファイルが容量上限を超えています。')
      this.preview = await this.api.prepareSaveImport(await file.text())
    } catch (cause) { this.fail('セーブファイルを読み込めませんでした。', cause) }
    finally { this.busy = false; this.changed() }
  }
  async confirm() {
    if (this.busy || !this.preview) return
    this.busy = true; this.failure = undefined; this.changed()
    try {
      await this.api.confirmSaveImport(this.preview.token)
      this.preview = undefined; this.message = 'セーブを復元しました。一時停止中です。'
      this.restored?.()
    } catch (cause) { this.fail('セーブを復元できませんでした。', cause) }
    finally { this.busy = false; this.changed() }
  }
  async cancel() {
    if (this.busy || !this.preview) return
    this.busy = true; this.failure = undefined; this.changed()
    try { await this.api.cancelSaveImport(this.preview.token); this.preview = undefined }
    catch (cause) { this.fail('セーブの取り込みを取り消せませんでした。', cause) }
    finally { this.busy = false; this.changed() }
  }
}

export function renderSaveImport(controller: SaveImportController, disabled = false) {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true,
    'aria-label': '取り込むセーブファイル', onchange: (event: Event) => {
      const element = event.target as HTMLInputElement, file = element.files?.[0]
      element.value = ''
      if (file) void controller.selectFile(file)
    } })
  return h('section', { class: 'save-import', 'aria-label': 'セーブファイルの取り込み', 'aria-busy': String(controller.busy) },
    h('h2', {}, 'セーブファイルの取り込み'),
    h('p', { class: 'hint' }, '書き出したJSONを選び、内容を確認してから現在の進行を置き換えます。'),
    h('p', { class: 'hint' }, `ファイル上限：${formatNumber(MAX_SAVE_IMPORT_BYTES / 1024)} KiB`),
    input,
    h('button', { type: 'button', disabled: disabled || controller.busy || Boolean(controller.preview),
      'data-focus-key': 'save-import-open', onclick: () => input.click() }, controller.busy ? '処理中…' : 'セーブファイルを選ぶ'),
    controller.error && !controller.preview ? h('p', { class: 'save-import-error', role: 'alert' }, controller.error) : null,
    controller.message ? h('p', { role: 'status' }, controller.message) : null)
}

export function renderSaveImportDialog(controller: SaveImportController) {
  const preview = controller.preview
  if (!preview) return null
  const timestamp = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(preview.savedAt))
  return h('div', { class: 'modal' }, h('section', { class: 'dialog save-import-dialog', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'save-import-title', 'aria-describedby': 'save-import-warning', 'data-panel-dialog': '', 'data-save-import-dialog': '', tabindex: '-1' },
    h('h2', { id: 'save-import-title' }, 'このセーブを復元しますか？'),
    h('p', { class: 'save-import-name' }, controller.fileName),
    h('dl', {},
      h('div', {}, h('dt', {}, '保存日時'), h('dd', {}, timestamp)),
      h('div', {}, h('dt', {}, '到達地点'), h('dd', {}, `${translatedLabel(difficulties[preview.depthRank].name)} · B${preview.currentStage}`)),
      h('div', {}, h('dt', {}, '小判'), h('dd', {}, formatNumber(preview.koban))),
      h('div', {}, h('dt', {}, 'プレイ時間'), h('dd', {}, `${Math.floor(preview.playMs / 60000)}分`))),
    h('ul', {}, ...preview.party.map(member => h('li', {}, `${translatedLabel(jobs[member.job].name)} · Lv ${member.level}`))),
    h('p', { id: 'save-import-warning' }, '確認すると現在の進行を置き換えます。この確認中に進んだ分も含め、元に戻せません。残したい場合は取り消して、先に書き出してください。'),
    h('p', {}, '保存日時からの放置報酬も再計算します。現在の所持金・経験値・装備に追加するのではなく、ファイルの進行へ戻してから受け取ります。'),
    h('p', {}, controller.resetSettings ? '復元後は一時停止し、破損した設定もOSの言語に合わせた初期設定へ置き換えます。購入した外観は変更しません。' : '復元後は一時停止します。設定と購入した外観は変更しません。'),
    controller.error ? h('p', { class: 'save-import-error', role: 'alert' }, controller.error) : null,
    h('div', { class: 'save-import-actions' },
      h('button', { type: 'button', disabled: controller.busy, 'data-focus-key': 'save-import-cancel', onclick: () => void controller.cancel() }, 'キャンセル'),
      h('button', { type: 'button', disabled: controller.busy, 'data-focus-key': 'save-import-confirm', onclick: () => void controller.confirm() }, controller.busy ? '処理中…' : '現在の進行を置き換えて復元'))))
}

/** Same controls for startup recovery when the ordinary game panel cannot be created. */
export function mountSaveImport(container: HTMLElement, api: SaveImportApi, options: { resetSettings?: boolean } = {}) {
  const controller = new SaveImportController(api, paint, options.resetSettings)
  const focus = new PanelModalFocus('[data-save-import-dialog]', () => { void controller.cancel() })
  function paint() {
    focus.beforeRender()
    container.replaceChildren(renderSaveImport(controller), renderSaveImportDialog(controller) ?? '')
    focus.sync(container)
  }
  paint()
}
