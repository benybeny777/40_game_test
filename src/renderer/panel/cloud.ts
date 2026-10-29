import { reportRendererError } from '../errors'
import type { CloudCommand, CloudResult, CloudView } from '../../shared/cloud'
import { getLocale, registerTranslations, registerTranslationTemplates, translatedLabel } from '../../shared/i18n'
import { h } from './dom'
import './cloud.css'

registerTranslations({
  'クラウドセーブ': 'Cloud saves',
  'クラウドの設定を読み込み中…': 'Loading cloud settings…',
  'クラウドサーバーは未接続です。ローカルのセーブで遊べます。': 'No cloud server is connected. You can continue using your local save.',
  '接続先': 'Server', 'アカウント': 'Account', 'ユーザー名': 'Username', 'パスワード（12文字以上）': 'Password (at least 12 characters)',
  'ログイン': 'Log in', 'アカウントを作成': 'Create account', '登録してログイン': 'Register and log in',
  'パスワードはこの画面に保存しません。': 'Your password is not saved in this screen.',
  'ユーザー名は半角小文字・数字・_の3〜32文字です。パスワードは12〜256文字です。': 'Use 3–32 lowercase letters, digits or underscores for your username. Passwords must contain 12–256 characters.',
  'クラウドの状態を確認できませんでした。接続を確認し、状態を再確認してください。': 'Could not check the cloud state. Check your connection and check the status again.',
  '通信結果を確認できませんでした。送信を繰り返す前に、クラウドの状態を確認してください。': 'The result could not be confirmed. Check the cloud status before sending again.',
  'クラウドにセーブはありません。': 'There is no cloud save yet.',
  'クラウドの状態は未確認です。「状態を確認」を押してから保存・読込してください。': 'The cloud status is unknown. Check the status before saving or loading.',
  'ログインしました。': 'You are logged in.', 'アカウントを作成してログインしました。': 'Your account has been created and you are logged in.',
  'クラウドの状態を更新しました。': 'Cloud status updated.', 'クラウドへ保存しました。': 'Saved to the cloud.',
  'クラウドの進行を読み込みました。': 'Cloud progress loaded.', 'ログアウトしました。': 'You are logged out.',
  '状態を確認': 'Check status', 'クラウドへ保存': 'Save to cloud', 'クラウドから読込': 'Load from cloud', 'ログアウト': 'Log out',
  '処理中…': 'Working…', '設定を再読込': 'Reload settings', 'キャンセル': 'Cancel',
  '現在のローカル進行をクラウドのセーブで上書きします。戻せないため、必要なら先にセーブを書き出してください。': 'This replaces your current local progress with the cloud save. Export your local save first if you need to keep it.',
  '現在の進行を上書きして読み込む': 'Replace local progress and load',
  'クラウド接続先はHTTPSのオリジン、またはローカル開発用HTTPにしてください。': 'Use an HTTPS origin for the cloud server, or local HTTP for development.',
  'クラウドセーブの応答形式が正しくありません。': 'The cloud save response has an invalid format.',
  'クラウドセーブの形式またはバージョンに対応していません。': 'This cloud save format or version is not supported.',
  'クラウド接続先が正しくありません。': 'The cloud server address is invalid.',
  'クラウド通信がタイムアウトしました。結果を確認してから再操作してください。': 'The cloud request timed out. Check the result before trying another operation.',
  'クラウドへ接続できませんでした。接続状況とサーバーを確認してください。': 'Could not connect to the cloud. Check your connection and the server.',
  'クラウド処理中です。完了してから操作してください。': 'A cloud operation is in progress. Wait for it to finish.',
  'クラウド保存の接続先が設定されていません。': 'No cloud save server is configured.',
  '別のアカウントに入る前にログアウトしてください。': 'Log out before signing in to another account.',
  'ユーザー名とパスワードを入力してください。': 'Enter your username and password.',
  'クラウド認証の応答形式が正しくありません。': 'The cloud authentication response has an invalid format.',
  'クラウド保存にはログインが必要です。': 'Log in to use cloud saves.',
  'クラウドの最新状態を確認してから、対象の版を選び直してください。': 'Check the latest cloud status, then select the revision again.',
  'クラウド保存の結果を確認できません。最新状態を確認してください。': 'The cloud save result could not be confirmed. Check the latest status.',
  'クラウドセーブが更新されました。対象の版を選び直してください。': 'The cloud save has changed. Select the revision again.',
  'クラウドにセーブがありません。': 'There is no cloud save.',
  'クラウド処理に失敗しました。': 'The cloud operation failed.',
  'ユーザー名またはパスワードの形式が正しくありません。': 'The username or password format is invalid.',
  '送信したセーブの形式または版が正しくありません。': 'The uploaded save format or revision is invalid.',
  'サーバーが要求するJSON形式で送信されていません。': 'The request was not sent in the JSON format required by the server.',
  '送信データがサーバーの容量上限を超えています。': 'The upload exceeds the server size limit.',
  '送信データをJSONとして読み取れませんでした。': 'The request data could not be read as JSON.',
  'サーバーへのデータ送信が中断されました。': 'The upload to the server was interrupted.',
  'サーバーが混雑しています。しばらく待ってから操作してください。': 'The server is busy. Wait a while before trying again.',
  '操作回数の上限に達しました。しばらく待ってから操作してください。': 'Too many requests. Wait a while before trying again.',
  'このゲームの接続元はサーバーで許可されていません。': 'The server does not allow this game origin.',
  'このユーザー名は既に登録されています。': 'This username is already registered.',
  'ユーザー名またはパスワードが正しくありません。': 'The username or password is incorrect.',
  '接続先に必要なクラウドAPIがありません。': 'The server does not provide the required cloud API.',
  'ログインが無効または期限切れです。もう一度ログインしてください。': 'Your session is invalid or expired. Log in again.',
  '別の端末でクラウドセーブが更新されました。最新状態を確認してください。': 'Another device has updated the cloud save. Check the latest status.',
  'このクラウドAPIは要求された操作に対応していません。': 'The cloud API does not support this operation.',
  'サーバーで処理を完了できませんでした。保存成功とは確認できていません。': 'The server could not complete the operation. Saving has not been confirmed.',
})
registerTranslationTemplates([
  { ja: 'クラウド版: {revision}', en: 'Cloud revision: {revision}' },
  { ja: '更新日時: {time}', en: 'Updated: {time}' },
  { ja: '版{revision}を読み込みます。', en: 'Load revision {revision}.' },
  { ja: 'クラウド処理に失敗しました: {summary}\n{detail}', en: 'Cloud operation failed: {summary}\n{detail}' },
  { ja: 'クラウド処理に失敗しました: {detail}', en: 'Cloud operation failed: {detail}' },
  { ja: 'クラウドセーブを復元できませんでした: {detail}', en: 'Could not restore the cloud save: {detail}' },
  { ja: 'クラウド応答を読み取れませんでした（HTTP {status}）。', en: 'Could not read the cloud response (HTTP {status}).' },
  { ja: 'HTTP {status}: 応答本文を読み取れませんでした。', en: 'HTTP {status}: Could not read the response body.' },
  { ja: '{detail} 保存結果が不明です。再保存せず、まず最新状態を確認してください。', en: '{detail} The save result is unknown. Check the latest status before saving again.' },
])

export interface CloudSettingsApi {
  getCloud(): Promise<CloudView>
  cloudCommand(command: CloudCommand): Promise<CloudResult>
}

/** This component retains only the account name, server metadata and its DOM; never a password value. */
export function createCloudSettings(api: CloudSettingsApi) {
  const root = h('section', { class: 'cloud-settings', 'aria-label': 'クラウドセーブ' })
  let view: CloudView | null = null, busy = false, started = false, reading = false, operationGeneration = 0
  let error = '', message = '', username = '', mode: 'login' | 'register' = 'login'
  let confirmRevision: number | null = null, paintedLocale = getLocale()

  const actionButton = (label: string, key: string, onclick: () => void, disabled = false) => h('button', {
    type: 'button', disabled: busy || disabled, 'data-focus-key': `cloud-${key}`, onclick,
  }, label)
  function paint() {
    paintedLocale = getLocale()
    root.setAttribute('aria-label', translatedLabel('クラウドセーブ'))
    root.setAttribute('aria-busy', String(busy))
    root.replaceChildren(h('h2', {}, 'クラウドセーブ'))
    if (error || view?.error) root.append(h('p', { class: 'cloud-error', role: 'alert' }, error || view!.error!))
    if (message) root.append(h('p', { role: 'status', 'aria-live': 'polite' }, message))
    if (!view) {
      root.append(h('p', {}, 'クラウドの設定を読み込み中…'))
      if (error) root.append(actionButton('設定を再読込', 'read', () => { void read() }))
      return
    }
    if (view.endpoint) root.append(h('p', { class: 'cloud-endpoint' }, h('b', {}, '接続先'), h('span', {}, view.endpoint)))
    if (!view.configured) {
      root.append(h('p', {}, 'クラウドサーバーは未接続です。ローカルのセーブで遊べます。'))
      return
    }
    if (!view.account) { root.append(loginForm()); return }
    root.append(h('p', { class: 'cloud-account' }, h('b', {}, 'アカウント'), h('span', {}, view.account.username)))
    if (view.revision !== null && view.revision > 0) {
      root.append(h('p', {}, `クラウド版: ${view.revision}`))
      if (view.updatedAt) {
        const date = new Date(view.updatedAt)
        const time = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        root.append(h('p', {}, `更新日時: ${time}`))
      }
    } else root.append(h('p', {}, view.revision === 0 ? 'クラウドにセーブはありません。' : 'クラウドの状態は未確認です。「状態を確認」を押してから保存・読込してください。'))
    const revision = view.revision
    root.append(h('div', { class: 'cloud-actions' },
      actionButton('状態を確認', 'refresh', () => { void run({ action: 'refresh' }) }),
      actionButton('クラウドへ保存', 'upload', () => {
        if (revision === null) { error = 'クラウドの状態は未確認です。「状態を確認」を押してから保存・読込してください。'; paint(); return }
        void run({ action: 'upload', revision })
      }, revision === null),
      actionButton('クラウドから読込', 'download', () => { confirmRevision = view!.revision; paint() }, !view.revision || view.revision < 1),
      actionButton('ログアウト', 'logout', () => { void run({ action: 'logout' }) })))
    if (confirmRevision !== null) {
      const revision = confirmRevision
      root.append(h('section', { class: 'cloud-confirm', 'aria-label': 'クラウドから読込' },
        h('p', {}, `版${revision}を読み込みます。`),
        h('p', {}, '現在のローカル進行をクラウドのセーブで上書きします。戻せないため、必要なら先にセーブを書き出してください。'),
        h('div', { class: 'cloud-actions' },
          actionButton('キャンセル', 'cancel-download', () => { confirmRevision = null; paint() }),
          actionButton('現在の進行を上書きして読み込む', 'confirm-download', () => { void run({ action: 'download', revision }) }))))
    }
    if (busy) root.append(h('p', { role: 'status' }, '処理中…'))
  }
  function loginForm() {
    const password = h('input', { type: 'password', required: true, minlength: 12, maxlength: 256, autocomplete: mode === 'register' ? 'new-password' : 'current-password', 'data-focus-key': 'cloud-password' })
    const form = h('form', { class: 'cloud-login', onsubmit: (event: Event) => {
      event.preventDefault()
      const secret = password.value
      password.value = ''
      if (busy) return
      if (!/^[a-z0-9_]{3,32}$/.test(username.trim()) || secret.length < 12 || secret.length > 256) { error = 'ユーザー名は半角小文字・数字・_の3〜32文字です。パスワードは12〜256文字です。'; paint(); return }
      void run({ action: mode, username: username.trim(), password: secret })
    } }, h('fieldset', { disabled: busy },
      h('label', {}, h('span', {}, 'アカウント'), h('select', { 'data-focus-key': 'cloud-mode', onchange: (event: Event) => { mode = (event.target as HTMLSelectElement).value as 'login' | 'register'; paint() } },
        h('option', { value: 'login', selected: mode === 'login' }, 'ログイン'), h('option', { value: 'register', selected: mode === 'register' }, 'アカウントを作成'))),
      h('label', {}, h('span', {}, 'ユーザー名'), h('input', { type: 'text', value: username, required: true, minlength: 3, maxlength: 32, pattern: '[a-z0-9_]{3,32}', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'data-focus-key': 'cloud-username', oninput: (event: Event) => { username = (event.target as HTMLInputElement).value } })),
      h('label', {}, h('span', {}, 'パスワード（12文字以上）'), password),
      h('p', {}, 'パスワードはこの画面に保存しません。'),
      h('p', {}, 'ユーザー名は半角小文字・数字・_の3〜32文字です。パスワードは12〜256文字です。'),
      h('button', { type: 'submit', disabled: busy, 'data-focus-key': 'cloud-submit' }, busy ? '処理中…' : mode === 'login' ? 'ログイン' : '登録してログイン')))
    return form
  }
  async function read(quiet = false) {
    if (busy || reading) return
    reading = true
    const generation = operationGeneration
    let changed = false
    if (!quiet) { busy = true; error = ''; paint() }
    try {
      const next = await api.getCloud()
      if (generation === operationGeneration && JSON.stringify(next) !== JSON.stringify(view)) { view = next; changed = true }
    } catch (failure) {
      if (generation === operationGeneration) { error = reportRendererError('クラウドの状態を確認できませんでした。接続を確認し、状態を再確認してください。', failure, false); changed = true }
    } finally { reading = false; if (!quiet) busy = false; if (changed || !quiet) paint() }
  }
  async function run(command: CloudCommand) {
    if (busy) return
    operationGeneration++
    busy = true; error = ''; message = ''; confirmRevision = null; paint()
    try {
      const result = await api.cloudCommand(command)
      view = result.view
      if (!result.ok) error = result.message ?? result.view.error ?? '通信結果を確認できませんでした。送信を繰り返す前に、クラウドの状態を確認してください。'
      else {
        const successes: Record<CloudCommand['action'], string> = {
          login: 'ログインしました。', register: 'アカウントを作成してログインしました。', refresh: 'クラウドの状態を更新しました。',
          upload: 'クラウドへ保存しました。', download: 'クラウドの進行を読み込みました。', logout: 'ログアウトしました。',
        }
        message = successes[command.action]
      }
    } catch (failure) {
      error = reportRendererError('通信結果を確認できませんでした。送信を繰り返す前に、クラウドの状態を確認してください。', failure, false)
    } finally { busy = false; paint() }
  }
  return () => {
    if (!started) { started = true; void read() }
    else { if (paintedLocale !== getLocale()) paint(); void read(true) }
    return root
  }
}

let renderSettings: ReturnType<typeof createCloudSettings> | undefined
export function renderCloudSettings() {
  renderSettings ??= createCloudSettings(window.game)
  return renderSettings()
}
