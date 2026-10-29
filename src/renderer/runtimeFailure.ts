import type { ShellApi, ShellState } from '../shared/api'
import { getLocale } from '../shared/i18n'
import { reportRendererError } from './errors'
import './runtimeFailure.css'

const boundaries = new WeakMap<ShellApi, RuntimeFailure>()
/** One terminal failure per window. Recovery is an explicit reload, never a frame retry. */
export class RuntimeFailure {
  private error = ''
  private frame: number | undefined
  private detail: HTMLElement | undefined
  get stopped() { return Boolean(this.error) }
  constructor(private readonly api: ShellApi) {
    api.onState(state => this.observe(state))
    void api.getState().then(state => this.observe(state)).catch(error => this.fail(error))
    window.addEventListener('error', event => this.fail(event.error ?? event.message))
    window.addEventListener('unhandledrejection', event => this.fail(event.reason))
  }
  observe(state: ShellState) { if (state.runtimeError) this.show(state.runtimeError) }
  fail(error: unknown) {
    if (this.stopped) return
    const message = reportRendererError('Runtime failure', error, false).slice(0, 8192)
    this.show(message)
    void this.api.reportRuntimeError(message).catch(reportError => {
      console.error('Could not stop game host after runtime failure', reportError)
      if (this.detail) this.detail.textContent += `\nHost stop failed: ${String(reportError)}`
    })
  }
  run(action: () => void): boolean {
    if (this.stopped) return false
    try { action(); return !this.stopped } catch (error) { this.fail(error); return false }
  }
  animate(draw: (now: number) => void) {
    if (this.frame !== undefined || this.stopped) return
    const next = (now: number) => {
      this.frame = undefined
      if (this.run(() => draw(now))) this.frame = requestAnimationFrame(next)
    }
    this.frame = requestAnimationFrame(next)
  }
  private show(message: string) {
    if (this.stopped) return
    this.error = message
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    const root = document.querySelector<HTMLElement>('#app'); if (root) root.inert = true
    const notice = document.createElement('section'); notice.className = 'runtime-failure'; notice.setAttribute('role', 'alertdialog'); notice.setAttribute('aria-modal', 'true')
    const en = getLocale() === 'en'
    const title = document.createElement('h2'); title.textContent = en ? 'The game has stopped' : '問題が発生したため停止しました'
    const hint = document.createElement('p'); hint.textContent = en ? 'Export your save before reloading. Reloading resumes from your last saved progress, paused.' : '保存データを書き出してから読み直してください。最後の保存から、一時停止した状態で開きます。'
    this.detail = document.createElement('pre'); this.detail.textContent = message
    const exportButton = document.createElement('button'); exportButton.textContent = en ? 'Export save' : '保存データを書き出す'
    const reload = document.createElement('button'); reload.textContent = en ? 'Reload paused' : '一時停止で読み直す'
    const act = (action: () => void) => { try { action() } catch (error) { console.error(error); this.detail!.textContent += `\n${String(error)}` } }
    exportButton.onclick = () => act(() => this.api.exportSave())
    reload.onclick = () => act(() => this.api.reloadAfterRuntimeError())
    notice.append(title, hint, this.detail, exportButton, reload); document.body.append(notice); exportButton.focus()
  }
}
export function runtimeFailure(api: ShellApi) {
  let boundary = boundaries.get(api)
  if (!boundary) { boundary = new RuntimeFailure(api); boundaries.set(api, boundary) }
  return boundary
}
