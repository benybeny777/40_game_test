import type { CloudCommand, CloudResult, CloudView } from './cloud'

const DEADLINE_MS = 10000
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
interface RemoteSave { revision: number; updatedAt: string | null; save: { format: 1; game: 'taskbar-hyakkiko'; profile: unknown } | null }
interface Callbacks { readProfile(): unknown; restoreProfile(profile: unknown): Promise<void> | void }
const serverProblems: Record<string, string> = {
  INVALID_CREDENTIALS: 'ユーザー名またはパスワードの形式が正しくありません。',
  INVALID_SAVE: '送信したセーブの形式または版が正しくありません。',
  JSON_REQUIRED: 'サーバーが要求するJSON形式で送信されていません。',
  BODY_TOO_LARGE: '送信データがサーバーの容量上限を超えています。',
  INVALID_JSON: '送信データをJSONとして読み取れませんでした。',
  REQUEST_ABORTED: 'サーバーへのデータ送信が中断されました。',
  SERVER_BUSY: 'サーバーが混雑しています。しばらく待ってから操作してください。',
  RATE_LIMITED: '操作回数の上限に達しました。しばらく待ってから操作してください。',
  ORIGIN_REJECTED: 'このゲームの接続元はサーバーで許可されていません。',
  USERNAME_TAKEN: 'このユーザー名は既に登録されています。',
  LOGIN_FAILED: 'ユーザー名またはパスワードが正しくありません。',
  NOT_FOUND: '接続先に必要なクラウドAPIがありません。',
  UNAUTHORIZED: 'ログインが無効または期限切れです。もう一度ログインしてください。',
  REVISION_CONFLICT: '別の端末でクラウドセーブが更新されました。最新状態を確認してください。',
  METHOD_NOT_ALLOWED: 'このクラウドAPIは要求された操作に対応していません。',
  INTERNAL_ERROR: 'サーバーで処理を完了できませんでした。保存成功とは確認できていません。',
}

function endpointOrigin(endpoint: string): string {
  const url = new URL(endpoint)
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/' || endpoint.includes('?') || endpoint.includes('#') || /^[a-z]+:\/\/[^/]*@/i.test(endpoint)) throw new Error('クラウド接続先はHTTPSのオリジン、またはローカル開発用HTTPにしてください。')
  return url.origin
}
function remoteSave(value: unknown): RemoteSave {
  if (!object(value) || !revision(value.revision)) throw new Error('クラウドセーブの応答形式が正しくありません。')
  if (value.revision === 0 && value.save === null && value.updatedAt === null) return { revision: 0, save: null, updatedAt: null }
  if (value.revision < 1 || !timestamp(value.updatedAt) || !object(value.save) || value.save.format !== 1 || value.save.game !== 'taskbar-hyakkiko' || !Object.hasOwn(value.save, 'profile')) throw new Error('クラウドセーブの形式またはバージョンに対応していません。')
  return { revision: value.revision, updatedAt: value.updatedAt, save: { format: 1, game: 'taskbar-hyakkiko', profile: value.save.profile } }
}
class ResponseError extends Error {
  readonly body: unknown
  readonly status: number
  constructor(status: number, options: { body: unknown; cause?: unknown }) {
    const body = options.body
    const problem = object(body) && object(body.error) ? body.error : body
    const detail = object(problem) && typeof problem.message === 'string' ? problem.message : `HTTP ${status}`
    const known = object(problem) && typeof problem.code === 'string' && Object.hasOwn(serverProblems, problem.code) ? serverProblems[problem.code] : undefined
    super(known ? `クラウド処理に失敗しました: ${known}\n${detail}` : `クラウド処理に失敗しました: ${detail}`, options)
    this.body = body
    this.status = status
  }
}

/** Explicit, single-request-at-a-time cloud operations. Credentials and bearer tokens are never persisted. */
export class CloudClient {
  private token: string | null = null
  private busy = false
  private state: CloudView
  private readonly callbacks: Callbacks
  private readonly fetchImpl: typeof fetch
  constructor(endpoint: string | undefined, callbacks: Callbacks, fetchImpl: typeof fetch = fetch) {
    this.callbacks = callbacks; this.fetchImpl = fetchImpl
    this.state = { configured: false, endpoint: null, account: null, revision: null, updatedAt: null, error: null }
    if (endpoint === undefined || endpoint.trim() === '') return
    try { this.state.endpoint = endpointOrigin(endpoint); this.state.configured = true }
    catch (error) { this.state.error = error instanceof Error ? error.message : 'クラウド接続先が正しくありません。' }
  }
  view(): CloudView { return structuredClone(this.state) }
  get isBusy(): boolean { return this.busy }
  private async request(path: string, method: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('クラウド通信がタイムアウトしました。結果を確認してから再操作してください。')) }, DEADLINE_MS) })
    const operation = (async () => {
      let response: Response
      try {
        response = await this.fetchImpl(`${this.state.endpoint}${path}`, {
          method, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
          headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })
      } catch (error) {
        if (controller.signal.aborted) throw new Error('クラウド通信がタイムアウトしました。結果を確認してから再操作してください。', { cause: error })
        throw new Error('クラウドへ接続できませんでした。接続状況とサーバーを確認してください。', { cause: error })
      }
      if (response.status === 204 && response.ok) return null
      let value: unknown
      try { value = await response.json() } catch (error) {
        if (!response.ok) throw new ResponseError(response.status, { body: { message: `HTTP ${response.status}: 応答本文を読み取れませんでした。` }, cause: error })
        throw new Error(`クラウド応答を読み取れませんでした（HTTP ${response.status}）。`, { cause: error })
      }
      if (!response.ok) throw new ResponseError(response.status, { body: value })
      return value
    })()
    try { return await Promise.race([operation, deadline]) }
    finally { clearTimeout(timer) }
  }
  private metadata(save: RemoteSave) { this.state.revision = save.revision; this.state.updatedAt = save.updatedAt }
  async execute(command: CloudCommand): Promise<CloudResult> {
    if (this.busy) return { ok: false, view: { ...this.view(), error: 'クラウド処理中です。完了してから操作してください。' } }
    if (!this.state.configured) return { ok: false, view: this.view(), message: this.state.error ?? 'クラウド保存の接続先が設定されていません。' }
    this.busy = true; this.state.error = null
    let writing = false
    try {
      if (command.action === 'register' || command.action === 'login') {
        if (this.token) throw new Error('別のアカウントに入る前にログアウトしてください。')
        if (!command.username.trim() || !command.password) throw new Error('ユーザー名とパスワードを入力してください。')
        const auth = await this.request(command.action === 'register' ? '/v1/accounts' : '/v1/sessions', 'POST', { username: command.username, password: command.password })
        if (!object(auth) || typeof auth.token !== 'string' || !auth.token || !object(auth.account) || typeof auth.account.id !== 'string' || !auth.account.id || typeof auth.account.username !== 'string' || !auth.account.username || !timestamp(auth.expiresAt)) throw new Error('クラウド認証の応答形式が正しくありません。')
        this.token = auth.token; this.state.account = { id: auth.account.id, username: auth.account.username }
        this.state.revision = null; this.state.updatedAt = null
        this.metadata(remoteSave(await this.request('/v1/save', 'GET')))
      } else {
        if (!this.token) throw new Error('クラウド保存にはログインが必要です。')
        if (command.action === 'logout') {
          await this.request('/v1/session', 'DELETE')
          this.token = null; this.state.account = null; this.state.revision = null; this.state.updatedAt = null
        } else if (command.action === 'refresh') {
          this.metadata(remoteSave(await this.request('/v1/save', 'GET')))
        } else {
          const selectedRevision = 'revision' in command ? command.revision : undefined
          if (!revision(selectedRevision) || this.state.revision === null || selectedRevision !== this.state.revision) throw new Error('クラウドの最新状態を確認してから、対象の版を選び直してください。')
          if (command.action === 'upload') {
            const save = { format: 1, game: 'taskbar-hyakkiko', profile: this.callbacks.readProfile() }
            writing = true
            const uploaded = remoteSave(await this.request('/v1/save', 'PUT', { baseRevision: selectedRevision, save }))
            if (uploaded.revision !== selectedRevision + 1) throw new Error('クラウド保存の結果を確認できません。最新状態を確認してください。')
            this.metadata(uploaded); writing = false
          } else {
            const downloaded = remoteSave(await this.request('/v1/save', 'GET'))
            this.metadata(downloaded)
            if (downloaded.revision !== selectedRevision) throw new Error('クラウドセーブが更新されました。対象の版を選び直してください。')
            if (!downloaded.save) throw new Error('クラウドにセーブがありません。')
            try { await this.callbacks.restoreProfile(structuredClone(downloaded.save.profile)) }
            catch (error) { throw new Error(`クラウドセーブを復元できませんでした: ${error instanceof Error ? error.message : '保存データを確認してください。'}`, { cause: error }) }
          }
        }
      }
      return { ok: true, view: this.view() }
    } catch (error) {
      const unknownWrite = writing && !(error instanceof ResponseError && [401, 409].includes(error.status))
      if (writing) { this.state.revision = null; this.state.updatedAt = null }
      // 401 confirms the session is already invalid, including after a lost logout response.
      // Network/5xx failures still retain it for an explicit retry.
      if (error instanceof ResponseError && error.status === 401) {
        this.token = null; this.state.account = null; this.state.revision = null; this.state.updatedAt = null
        if (command.action === 'logout') return { ok: true, view: this.view() }
      }
      this.state.error = error instanceof Error ? error.message : 'クラウド処理に失敗しました。'
      if (unknownWrite) this.state.error += ' 保存結果が不明です。再保存せず、まず最新状態を確認してください。'
      return { ok: false, view: this.view(), message: this.state.error }
    } finally { this.busy = false }
  }
}
