import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newProfile, PROFILE_VERSION, type Profile } from '../src/core/index.ts'
import { defaultSettings, type ShellApi, type ShellState } from '../src/shared/api.ts'
import { initializePlatform } from '../src/renderer/platform.ts'
import { getLocale, setLocale } from '../src/shared/i18n'

const storageKey = 'hyakkiko.web.save'
const start = Date.parse('2026-10-29T03:00:00.000Z')
class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  failWrites = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error('QuotaExceededError'); this.values.set(key, String(value)) }
}
class Element {
  className = ''; textContent = ''; children: Element[] = []; href = ''; download = ''
  append(...children: Element[]) { this.children.push(...children) }
  replaceChildren(...children: Element[]) { this.children = children }
  click() {}
  remove() {}
}
class BrowserDocument extends EventTarget {
  hidden = false; body = new Element(); root = new Element()
  createElement() { return new Element() }
  querySelector(selector: string) { return selector === '#app' ? this.root : null }
}
class BrowserWindow extends EventTarget { game?: ShellApi; devicePixelRatio = 2 }
let randomValue = 0
function browser(storage = new MemoryStorage(), hidden = false) {
  const at = Date.now()
  vi.clearAllTimers()
  vi.setSystemTime(at)
  const document = new BrowserDocument(), window = new BrowserWindow()
  document.hidden = hidden
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('sessionStorage', new MemoryStorage())
  vi.stubGlobal('navigator', { language: 'ja-JP', userActivation: { isActive: true } })
  vi.stubGlobal('crypto', { getRandomValues: (values: Uint32Array) => { for (let i = 0; i < values.length; i++) values[i] = ++randomValue; return values } })
  return { document, window, storage }
}
const envelope = (profile: Profile, paused = false) => JSON.stringify({ format: 1, profile,
  settings: { ...defaultSettings, hideOnFullscreen: false, autoStart: false }, state: { paused } })
function seed(storage: MemoryStorage, profile: Profile, paused = false) { storage.setItem(storageKey, envelope(profile, paused)) }
function storageEvent(window: BrowserWindow, key: string | null, storage: Storage | null, newValue: string | null) {
  const event = new Event('storage')
  Object.defineProperties(event, { key: { value: key }, storageArea: { value: storage }, newValue: { value: newValue } })
  window.dispatchEvent(event)
}
const profiled = () => {
  const profile = newProfile(new Date(start).toISOString(), 7)
  profile.rates.minutes = [{ koban: 120, exp: 60 }]
  return profile
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start); randomValue = 0 })
afterEach(() => { setLocale('ja'); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('ブラウザー保存・復帰・操作', () => {
  it('クラウド復元のローカル書込が失敗しても現在の進行は失わない', async () => {
    const { storage } = browser(), original = profiled(), remote = profiled()
    original.koban = 123; remote.koban = 777; seed(storage, original, true)
    const response = { revision: 1, updatedAt: new Date(start).toISOString(), save: { format: 1, game: 'taskbar-hyakkiko', profile: remote } }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'test-only-session', account: { id: 'account', username: 'testuser' }, expiresAt: '2027-01-01T00:00:00Z' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(response)))
      .mockResolvedValueOnce(new Response(JSON.stringify(response))))
    const api = initializePlatform()
    expect((await api.cloudCommand({ action: 'login', username: 'testuser', password: 'test-password-123' })).ok).toBe(true)
    storage.failWrites = true
    expect((await api.cloudCommand({ action: 'download', revision: 1 })).ok).toBe(false)
    expect((await api.getView()).koban).toBe(123)
    expect((await api.getState()).paused).toBe(true)
    expect((await api.getState()).storageError).toBeTruthy()
    expect(JSON.parse(storage.getItem(storageKey)!).profile.koban).toBe(123)
  })
  it.each([['ja-JP', 'ja'], ['en-US', 'en'], ['fr-FR', 'en']])('初回はOS言語%sを使い、設定を通常セーブだけへ保存する', async (language, expected) => {
    const { storage } = browser()
    vi.stubGlobal('navigator', { language })
    const api = initializePlatform()
    expect((await api.getState()).settings.locale).toBe(expected)
    expect(getLocale()).toBe(expected)
    expect(JSON.parse(storage.getItem(storageKey)!).settings.locale).toBe(expected)
    expect(storage.length).toBe(1)
  })
  it('旧言語キーを一度だけ優先移行し、成功後は通常設定だけを正本にする', async () => {
    const { storage } = browser()
    seed(storage, profiled()); storage.setItem('hyakkiko.locale', 'en')
    const api = initializePlatform()
    expect((await api.getState()).settings.locale).toBe('en')
    expect(storage.getItem('hyakkiko.locale')).toBeNull()
    expect(JSON.parse(storage.getItem(storageKey)!).settings.locale).toBe('en')
    await api.updateSettings({ locale: 'ja' })
    expect(getLocale()).toBe('ja')
    browser(storage); vi.stubGlobal('navigator', { language: 'en-US' })
    expect((await initializePlatform().getState()).settings.locale).toBe('ja')
    expect(getLocale()).toBe('ja')
  })
  it('移行の保存失敗では旧キーと元セーブを保護し、停止と保存障害を表示する', async () => {
    const { storage } = browser()
    seed(storage, profiled()); storage.setItem('hyakkiko.locale', 'en')
    const original = storage.getItem(storageKey); storage.failWrites = true
    const state = await initializePlatform().getState()
    expect(state.paused).toBe(true); expect(state.storageError).toBeTruthy()
    expect(storage.getItem('hyakkiko.locale')).toBe('en')
    expect(storage.getItem(storageKey)).toBe(original)
  })
  it('旧言語キーの削除失敗も見える障害として停止し、移行済み設定を保持する', async () => {
    const { storage } = browser()
    storage.setItem('hyakkiko.locale', 'en')
    vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    const state = await initializePlatform().getState()
    expect(state.paused).toBe(true); expect(state.storageError).toContain('言語設定の移行')
    expect(JSON.parse(storage.getItem(storageKey)!).settings.locale).toBe('en')
    expect(storage.getItem('hyakkiko.locale')).toBe('en')
  })
  it('旧言語キーの読み込み拒否は初期値で握り潰さず起動エラーへ渡す', () => {
    const { storage, document } = browser()
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
    expect(() => initializePlatform()).toThrow('storage denied')
    expect(document.root.children[0].children.map(node => node.textContent).join(' ')).toContain('storage denied')
    expect(storage.length).toBe(0)
  })
  it('言語変更の保存失敗は表示と設定を戻し、保存できたふりをしない', async () => {
    const { storage } = browser(), api = initializePlatform()
    const original = storage.getItem(storageKey)
    storage.failWrites = true; setLocale('en')
    await expect(api.updateSettings({ locale: 'en' })).rejects.toThrow()
    const state = await api.getState()
    expect(state.settings.locale).toBe('ja'); expect(getLocale()).toBe('ja')
    expect(state.storageError).toBeTruthy(); expect(state.paused).toBe(true)
    expect(storage.getItem(storageKey)).toBe(original)
    setLocale('en')
    await expect(api.updateSettings({ locale: 'en' })).rejects.toThrow()
    expect(getLocale()).toBe('ja')
  })
  it('Electronのpreload APIがあればブラウザーセーブを書かずに利用する', () => {
    const { window, storage } = browser()
    const native = { sentinel: true } as unknown as ShellApi
    window.game = native
    expect(initializePlatform()).toBe(native)
    expect(storage.getItem(storageKey)).toBeNull()
  })
  it('一つのenvelopeへ設定・手動ポイント・進行を保存しreloadで復元する', async () => {
    const { storage } = browser(), profile = profiled()
    profile.koban = 345; profile.party.members.samurai.lv = 2; profile.party.members.samurai.autoStats = false
    seed(storage, profile)
    const api = initializePlatform()
    expect((await api.command({ c: 'allocateStats', job: 'samurai', key: 'str', points: 1 })).ok).toBe(true)
    await api.updateSettings({ fpsCap: 15, size: 'small', autoStart: true, hideOnFullscreen: true })
    const saved = JSON.parse(storage.getItem(storageKey)!)
    expect(storage.length).toBe(1); expect(saved.format).toBe(1); expect(saved.revision).toMatch(/^[0-9a-f]{32}$/)
    expect(saved.profile.party.members.samurai.allocated.str).toBe(1)
    browser(storage)
    const restored = initializePlatform(), view = await restored.getView(), state = await restored.getState()
    expect(view.koban).toBe(345)
    expect(view.party.find(member => member.job === 'samurai')!.allocated.str).toBe(1)
    expect(state.settings.fpsCap).toBe(15); expect(state.settings.size).toBe('small')
    expect(state.settings.autoStart).toBe(false); expect(state.settings.hideOnFullscreen).toBe(false)
  })
  it('足りないポイントや未知の操作で保存・配分を変更しない', async () => {
    const { storage } = browser(), profile = profiled()
    profile.party.members.samurai.lv = 2; profile.party.members.samurai.autoStats = false
    seed(storage, profile)
    const api = initializePlatform(), before = storage.getItem(storageKey)
    expect((await api.command({ c: 'allocateStats', job: 'samurai', key: 'str', points: 4 })).ok).toBe(false)
    expect((await api.command({ c: 'allocateStats', job: 'samurai', key: 'str', points: -1 })).ok).toBe(false)
    expect(storage.getItem(storageKey)).toBe(before)
    expect((await api.getView()).party.find(member => member.job === 'samurai')!.allocated.str).toBe(0)
  })
  it.each(['future', 'corrupt', 'settings'])('%s保存の原文を保護し、代わりの新規セーブを上書きしない', kind => {
    const { storage, document } = browser(), profile = profiled()
    if (kind === 'future') profile.version = PROFILE_VERSION + 1
    const text = kind === 'corrupt' ? '{broken json' : kind === 'settings' ? JSON.stringify({ format: 1, profile, settings: null, state: { paused: false } }) : envelope(profile)
    storage.setItem(storageKey, text)
    expect(() => initializePlatform()).toThrow()
    expect(storage.getItem(storageKey)).toBe(text)
    expect(document.root.children[0].children[0].textContent).toBe('保存データを確認してください')
  })
  it('英語設定の起動エラーでも元のセーブを保護し、復旧案内を英語で表示する', () => {
    const { storage, document } = browser(), profile = profiled()
    vi.stubGlobal('navigator', { language: 'en-US' }); profile.version = PROFILE_VERSION + 1
    const original = envelope(profile); storage.setItem(storageKey, original)
    expect(() => initializePlatform()).toThrow()
    expect(storage.getItem(storageKey)).toBe(original)
    const messages = document.root.children[0].children.map(node => node.textContent).join(' ')
    expect(messages).toContain('Please check your save data')
    expect(messages).toContain('newer version')
    expect(messages).not.toMatch(/[ぁ-んァ-ヶ一-龥]/u)
  })
  it('容量不足で停止・状態通知し、最後に保存できた原文を保護する', async () => {
    const { storage } = browser(), profile = profiled()
    profile.koban = 300; seed(storage, profile)
    const api = initializePlatform(), before = storage.getItem(storageKey), notices: ShellState[] = []
    api.onState(state => notices.push(state)); storage.failWrites = true
    const result = await api.command({ c: 'buyDojo', key: 'atk' })
    expect(result.ok).toBe(false)
    expect((await api.getState()).paused).toBe(true)
    expect(notices.some(state => state.paused && state.storageError)).toBe(true)
    expect(storage.getItem(storageKey)).toBe(before)
    const view = await api.getView()
    expect((await api.command({ c: 'buyDojo', key: 'hp' })).ok).toBe(false)
    await vi.advanceTimersByTimeAsync(10000)
    expect((await api.getView()).stats.playMs).toBe(view.stats.playMs)
  })
  it('起動時offlineを一度保存し、同時刻のreloadで二重加算しない', async () => {
    const { storage } = browser(), profile = profiled()
    profile.savedAt = new Date(start - 600000).toISOString(); seed(storage, profile)
    const api = initializePlatform(), reward = (await api.getView()).pendingOffline
    expect(reward?.koban).toBe(600)
    browser(storage)
    const restored = initializePlatform()
    expect((await restored.getView()).pendingOffline).toEqual(reward)
  })
  it('visibilityとpagehide/pageshowが重複しても同じ背景時間のofflineは一度だけ', async () => {
    const { storage, document, window } = browser(); seed(storage, profiled())
    const api = initializePlatform()
    await vi.advanceTimersByTimeAsync(1000)
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide'))
    const before = (await api.getView()).stats.playMs
    await vi.advanceTimersByTimeAsync(600000)
    expect((await api.getView()).stats.playMs).toBe(before)
    document.hidden = false; window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow'))
    expect((await api.getView()).pendingOffline?.koban).toBe(600)
    browser(storage)
    expect((await initializePlatform().getView()).pendingOffline?.koban).toBe(600)
  })
  it('背景タブへのpageshowでは再開せず、本当に可視になってからofflineを一度付与する', async () => {
    const { storage, document, window } = browser(undefined, true); seed(storage, profiled())
    const api = initializePlatform()
    window.dispatchEvent(new Event('pageshow'))
    await vi.advanceTimersByTimeAsync(600000)
    expect((await api.getView()).stats.playMs).toBe(0)
    expect((await api.getView()).pendingOffline).toBeNull()
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow'))
    expect((await api.getView()).pendingOffline?.koban).toBe(600)
  })
  it('一時停止中の背景時間ではoffline報酬を受け取らない', async () => {
    const { storage, document } = browser(); seed(storage, profiled(), true)
    const api = initializePlatform()
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(600000)
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange'))
    expect((await api.getView()).pendingOffline).toBeNull()
    expect((await api.getView()).stats.playMs).toBe(0)
  })
  it('別タブの変更を検知して相手の保存を上書きしない', async () => {
    const { storage, window } = browser(); seed(storage, profiled())
    const api = initializePlatform(), other = envelope({ ...profiled(), koban: 987 })
    storage.setItem(storageKey, other); storageEvent(window, storageKey, storage, other)
    expect((await api.getState()).paused).toBe(true)
    expect((await api.command({ c: 'setLoop', loop: true })).ok).toBe(false)
    await vi.advanceTimersByTimeAsync(10000)
    expect(storage.getItem(storageKey)).toBe(other)
  })
  it('別タブのlocalStorage.clearを即時検知して空の保存領域へ書き戻さない', async () => {
    const { storage, window } = browser(); seed(storage, profiled())
    const api = initializePlatform()
    storage.clear(); storageEvent(window, null, storage, null)
    expect((await api.getState()).paused).toBe(true)
    expect((await api.getState()).storageError).toContain('別の画面')
    await vi.advanceTimersByTimeAsync(10000)
    expect(storage.getItem(storageKey)).toBeNull()
  })
  it('同じ時刻・同じprofileの二つの保存もrevisionで見分ける', async () => {
    const first = browser(); seed(first.storage, profiled())
    const api = initializePlatform(), original = first.storage.getItem(storageKey)
    // A second tab opens at exactly the same clock time with the same initial profile.
    browser(first.storage); initializePlatform()
    const competing = first.storage.getItem(storageKey)
    expect(competing).not.toBe(original)
    storageEvent(first.window, storageKey, first.storage, competing)
    expect((await api.getState()).paused).toBe(true)
    expect(first.storage.getItem(storageKey)).toBe(competing)
  })
  it('別のkeyやsessionStorageのイベントでは停止しない', async () => {
    const { storage, window } = browser(); seed(storage, profiled())
    const api = initializePlatform(), session = new MemoryStorage()
    storageEvent(window, 'other-key', storage, 'x'); storageEvent(window, storageKey, session, 'x')
    expect((await api.getState()).paused).toBe(false)
  })
  it('保存JSONの購入済み偽装や任意購入APIで課金・所有権を有効にできない', async () => {
    const { storage } = browser()
    const forged = JSON.parse(envelope(profiled()))
    forged.store = { owned: ['ground_sakura'], mode: 'live' }; forged.state.appearance = { id: 'sakura' }
    storage.setItem(storageKey, JSON.stringify(forged))
    const api = initializePlatform(), store = await api.getStore()
    expect(store.mode).toBe('unavailable'); expect(store.products.every(product => !product.owned && !product.purchasable)).toBe(true)
    expect((await api.purchaseProduct('ground_sakura')).ok).toBe(false)
    expect((await api.equipCosmetic('ground_sakura')).ok).toBe(false)
    expect(await api.previewCosmetic('ground_sakura')).toBe(true)
    expect((await api.getState()).appearance?.id).toBe('sakura')
    await vi.advanceTimersByTimeAsync(30000)
    expect((await api.getState()).appearance).toBeNull()
    expect((await api.getStore()).products.every(product => !product.owned)).toBe(true)
  })
  it('購読先の受け取った値を書き換えてもゲームの正本を変更しない', async () => {
    const { storage } = browser(); seed(storage, profiled())
    const api = initializePlatform(), view = await api.getView(), state = await api.getState()
    view.koban = 99999; state.paused = true
    expect((await api.getView()).koban).toBe(0)
    expect((await api.getState()).paused).toBe(false)
  })
})

describe('runtime failure isolation', () => {
  it('removes a broken state subscriber before notifying the remaining subscribers', async () => {
    const { storage } = browser(), api = initializePlatform(), checkpoint = storage.getItem(storageKey)
    const broken = vi.fn(() => { throw new Error('broken panel renderer') }), healthy = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.onState(broken); api.onState(healthy)
    await Promise.resolve()
    expect(broken).toHaveBeenCalledTimes(1)
    expect((await api.getState()).runtimeError).toContain('broken panel renderer')
    expect((await api.getState()).storageError).toBeUndefined()
    expect((await api.getState()).paused).toBe(true)
    expect(healthy).toHaveBeenCalled()
    vi.advanceTimersByTime(60000)
    expect(storage.getItem(storageKey)).toBe(checkpoint)
    api.openMenu(); expect((await api.getState()).paused).toBe(true)
    expect((await api.command({ c: 'returnTown' })).ok).toBe(false)
    log.mockRestore()
  })
  it('keeps the first cause and permits save export after stopping', async () => {
    browser(); const api = initializePlatform()
    await api.reportRuntimeError('first failure'); await api.reportRuntimeError('secondary failure')
    expect((await api.getState()).runtimeError).toBe('first failure')
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export')
    api.exportSave(); expect(create).toHaveBeenCalledOnce(); create.mockRestore()
  })
  it('reloads the previous checkpoint paused without overwriting the saved profile', async () => {
    const { window, storage } = browser(), api = initializePlatform(), checkpoint = storage.getItem(storageKey)
    const reload = vi.fn(); Object.assign(window, { location: { reload } })
    await api.reportRuntimeError('draw failure'); api.reloadAfterRuntimeError()
    expect(reload).toHaveBeenCalledOnce(); expect(storage.getItem(storageKey)).toBe(checkpoint)
    const session = sessionStorage
    browser(storage); vi.stubGlobal('sessionStorage', session)
    const next = initializePlatform()
    expect((await next.getState()).paused).toBe(true)
    expect((await next.getState()).runtimeError).toBeUndefined()
    expect(JSON.parse(storage.getItem(storageKey)!).profile).toEqual(JSON.parse(checkpoint!).profile)
  })
})
