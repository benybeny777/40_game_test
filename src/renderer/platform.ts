import { reportRendererError } from './errors'
/** Browser adapter for the shared panel and simulation. Electron's preload API remains authoritative when present. */
import { addOffline, advance, balance, buildView, computeOffline, createGame, newProfile, PROFILE_VERSION, runCommand, snapshot, validateProfile,
  type CommandResult, type Game, type Profile, type ProfileView, type SimEvent } from '../core/index.ts'
import { catalog } from '../commerce/catalog.ts'
import { defaultSettings, type Frame, type PanelTarget, type Settings, type ShellApi, type ShellState, type StripLayout } from '../shared/api'
import type { CommerceResult, StoreView } from '../shared/commerce'
import { PLAY_DOTS } from '../shared/art'
import { parseCommand, parseSettings, parseTarget } from '../shared/validate'
import { getLocale, setLocale, systemLocale, translatedLabel } from '../shared/i18n'
import { CloudClient } from '../shared/cloudClient'
import { DEVELOPMENT_CLOUD_ENDPOINT, parseCloudCommand } from '../shared/cloud'
import { prepareCloudRestore } from '../shared/cloudProfile'

const STORAGE_KEY = 'hyakkiko.web.save'
const RUNTIME_PAUSED_KEY = 'hyakkiko.runtime-paused'
const LEGACY_LOCALE_KEY = 'hyakkiko.locale'
const STORAGE_FORMAT = 1
const AUTOSAVE_MS = 5000, SLEEP_GAP_MS = 60000, VIEW_INTERVAL_MS = 400, MAX_STEPS = 50, PREVIEW_MS = 30000
type BrowserState = ShellState & { platform: 'browser'; storageError?: string }
interface SavedBrowserGame { format: number; revision: string; profile: Profile; settings: Settings; state: { paused: boolean } }
const copy = <T>(value: T): T => structuredClone(value)
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function showLoadError(message: string) {
  if (document.documentElement) document.documentElement.lang = getLocale()
  const root = document.querySelector('#app') ?? document.body
  const section = document.createElement('section'); section.className = 'browser-load-error'
  const title = document.createElement('h1'); title.textContent = translatedLabel('保存データを確認してください')
  const text = document.createElement('p'); text.textContent = translatedLabel(message)
  const hint = document.createElement('p'); hint.textContent = translatedLabel('保存データは変更していません。このブラウザーのデータを消さずに、対応するバージョンで開いてください。')
  section.append(title, text, hint); root.replaceChildren(section)
}

export function initializePlatform(): ShellApi {
  if (window.game) return window.game
  let stored: string | null
  let profile: Profile, settings: Settings, paused = false
  let legacyLocale: string | null
  const now = Date.now()
  try {
    legacyLocale = localStorage.getItem(LEGACY_LOCALE_KEY)
    const initialLocale = legacyLocale === 'ja' || legacyLocale === 'en' ? legacyLocale : systemLocale(navigator.language ?? Intl.DateTimeFormat().resolvedOptions().locale)
    setLocale(initialLocale)
    stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      const raw: unknown = JSON.parse(stored)
      if (!object(raw) || raw.format !== STORAGE_FORMAT || !object(raw.profile)) throw new Error('保存形式が対応していません。')
      if (Number(raw.profile.version) > PROFILE_VERSION) throw new Error('新しいバージョンで保存されたデータです。最新版で開いてください。')
      profile = validateProfile(raw.profile)
      const parsedSettings = parseSettings(raw.settings)
      if (!parsedSettings || !object(raw.state) || typeof raw.state.paused !== 'boolean') throw new Error('保存した設定を読み込めません。')
      settings = { ...defaultSettings, ...parsedSettings, hideOnFullscreen: false, autoStart: false }
      settings.locale = legacyLocale === 'ja' || legacyLocale === 'en' ? legacyLocale : parsedSettings.locale ?? initialLocale
      setLocale(settings.locale)
      paused = raw.state.paused
      if (!Number.isFinite(Date.parse(profile.savedAt))) throw new Error('保存日時を読み込めません。')
    } else {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      profile = newProfile(new Date(now).toISOString(), seed)
      settings = { ...defaultSettings, locale: initialLocale, hideOnFullscreen: false, autoStart: false }
    }
    if (sessionStorage.getItem(RUNTIME_PAUSED_KEY) === '1') { paused = true; sessionStorage.removeItem(RUNTIME_PAUSED_KEY) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'このブラウザーの保存データを読み込めません。'
    showLoadError(message)
    throw new Error(message, { cause: error })
  }

  let game: Game = createGame(profile, profile.rng)
  const state: BrowserState = { paused, visible: true, profile: 'user', settings, packaged: false,
    fullscreenHidden: false, fullscreenSupported: false, appearance: null, platform: 'browser' }
  const subscribers = {
    frame: new Set<(frame: Frame) => void>(), view: new Set<(view: ProfileView) => void>(), state: new Set<(state: ShellState) => void>(),
    layout: new Set<(layout: StripLayout) => void>(), navigate: new Set<(target: PanelTarget) => void>(),
  }
  const emit = <T>(listeners: Set<(value: T) => void>, value: T) => {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue
      try { listener(copy(value)) } catch (error) {
        listeners.delete(listener)
        stopRuntime(reportRendererError('Browser view update failed', error, false))
      }
    }
  }
  const currentFrame = (events: SimEvent[] = []): Frame => ({ snapshot: snapshot(game.world, game.profile.koban), events })
  const currentView = () => buildView(game.profile, game.world.loop)
  const currentLayout = (): StripLayout => ({ dotPx: Math.max(1, Math.round(window.devicePixelRatio || 1)), playDots: PLAY_DOTS,
    scaleFactor: window.devicePixelRatio || 1, headroomDip: 72 })
  const publishState = () => emit(subscribers.state, state)
  const publishView = () => emit(subscribers.view, currentView())
  let storageBlocked = false, lastSave = now, lastTick = now, lastView = now, accumulated = 0
  let suspendedAt: number | null = document.hidden ? now : null
  let previewTimer: ReturnType<typeof setTimeout> | undefined

  let tickTimer: ReturnType<typeof setInterval> | undefined = undefined
  function stopRuntime(message: string) {
    if (state.runtimeError) return
    state.runtimeError = message; state.paused = true; accumulated = 0
    if (tickTimer !== undefined) clearInterval(tickTimer)
    publishState()
  }
  function blockStorage(message: string) {
    storageBlocked = true; state.paused = true; state.storageError = message; publishState()
  }
  function persist(at = Date.now()): boolean {
    if (storageBlocked || state.runtimeError) return false
    try {
      if (localStorage.getItem(STORAGE_KEY) !== stored) {
        blockStorage('別の画面で保存データが更新されました。重複した画面を閉じ、読み直してください。'); return false
      }
      const savedAt = new Date(at).toISOString()
      // A unique revision also detects two sessions that happen to save identical profiles in the same millisecond.
      const revision = [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16).padStart(8, '0')).join('')
      const record: SavedBrowserGame = { format: STORAGE_FORMAT, revision, profile: { ...game.profile, savedAt }, settings: state.settings, state: { paused: state.paused } }
      const text = JSON.stringify(record)
      localStorage.setItem(STORAGE_KEY, text)
      stored = text; game.profile.savedAt = savedAt; lastSave = at
      return true
    } catch (error) {
      blockStorage(reportRendererError('保存できなかったため、一時停止しました。端末の空き容量を確認し、必要なら保存データを書き出してください。', error, false))
      return false
    }
  }
  function offline(elapsedMs: number) {
    if (state.paused || elapsedMs <= 0) return
    const reward = computeOffline(game.profile, elapsedMs)
    if (reward) addOffline(game.profile, reward)
  }
  offline(now - Date.parse(game.profile.savedAt))
  if (persist(now) && legacyLocale !== null) {
    try { localStorage.removeItem(LEGACY_LOCALE_KEY) }
    catch (error) { blockStorage(reportRendererError('言語設定の移行を完了できませんでした。保存データを書き出してから読み直してください。', error, false)) }
  }

  const storeView = (): StoreView => ({ mode: 'unavailable', message: '外観を試着できます。ブラウザー版では購入・Steam取引は利用できません。',
    equippedSku: null, appearance: copy(state.appearance), pending: false,
    products: catalog.map(product => ({ sku: product.sku, name: product.name, description: product.description,
      price: null, owned: false, equipped: false, purchasable: false, theme: copy(product.theme) })),
    market: { available: false, message: 'Steamのマーケット取引は、このブラウザー版では利用できません。' } })
  const declinePurchase = (): CommerceResult => ({ ok: false, reason: 'このブラウザー版では購入できません。', view: storeView() })
  function clearPreview() {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = undefined; state.appearance = null; publishState()
  }
  function downloadProfile() {
    if (navigator.userActivation && !navigator.userActivation.isActive) {
      throw new Error('保存データの書き出しボタンを押してください。')
    }
    const file = new Blob([JSON.stringify({ ...game.profile, savedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file), anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'hyakkiko-web-save.json'; document.body.append(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const subscribe = <T>(listeners: Set<(value: T) => void>, listener: (value: T) => void, initial?: () => T) => {
    listeners.add(listener)
    if (initial) queueMicrotask(() => { if (listeners.has(listener)) { try { listener(copy(initial())) } catch (error) { listeners.delete(listener); stopRuntime(reportRendererError('Browser initial view failed', error, false)) } } })
    return () => { listeners.delete(listener) }
  }
  const cloud = new CloudClient(import.meta.env.VITE_CLOUD_URL ?? (import.meta.env.DEV ? DEVELOPMENT_CLOUD_ENDPOINT : undefined), {
    readProfile: () => ({ ...copy(game.profile), savedAt: new Date().toISOString() }),
    restoreProfile: raw => {
      if (storageBlocked || state.runtimeError) throw new Error(state.runtimeError ?? state.storageError)
      const restored = prepareCloudRestore(raw), next = createGame(restored, restored.rng), previous = game
      game = next; state.paused = true; accumulated = 0; lastTick = Date.now()
      if (!persist()) {
        game = previous; publishState(); publishView(); emit(subscribers.frame, currentFrame())
        throw new Error(state.storageError)
      }
      publishState(); publishView(); emit(subscribers.frame, currentFrame())
    },
  })
  const api: ShellApi = {
    getCloud: async () => cloud.view(),
    cloudCommand: async command => { if (state.runtimeError) throw new Error(state.runtimeError); return cloud.execute(parseCloudCommand(command)) },
    pointer: () => {},
    openPanel: target => emit(subscribers.navigate, parseTarget(target)),
    openMenu: () => {
      if (storageBlocked || state.runtimeError) return
      state.paused = !state.paused; accumulated = 0; lastTick = Date.now(); persist(); publishState()
    },
    getLayout: async () => copy(currentLayout()),
    onLayout: listener => subscribe(subscribers.layout, listener, currentLayout),
    onFrame: listener => subscribe(subscribers.frame, listener, currentFrame),
    getState: async () => copy(state),
    onState: listener => subscribe(subscribers.state, listener, () => state),
    getView: async () => copy(currentView()),
    onView: listener => subscribe(subscribers.view, listener, currentView),
    command: async value => {
      if (state.runtimeError) return { ok: false, reason: state.runtimeError }
      if (storageBlocked) return { ok: false, reason: '保存できないため操作を止めています。保存データを書き出してから読み直してください。' }
      const command = parseCommand(value)
      if (!command) return { ok: false, reason: '操作を読み取れませんでした。' }
      const result = runCommand(game, command)
      if (result.ok) {
        persist(); publishView(); emit(subscribers.frame, currentFrame(result.events ?? []))
        if (storageBlocked) return { ok: false, reason: '操作は反映されましたが保存できませんでした。保存データを書き出してください。' }
      }
      return (result.ok ? { ok: true } : { ok: false, reason: result.reason }) as CommandResult
    },
    updateSettings: async value => {
      if (state.runtimeError) throw new Error(state.runtimeError)
      if (storageBlocked) {
        if (state.settings.locale) setLocale(state.settings.locale)
        throw new Error(state.storageError)
      }
      const next = parseSettings(value)
      if (!next) throw new Error('保存した設定を読み込めません。')
      const previous = state.settings
      state.settings = { ...previous, ...next, hideOnFullscreen: false, autoStart: false }
      if (!persist()) {
        state.settings = previous; publishState(); if (previous.locale) setLocale(previous.locale)
        throw new Error(state.storageError)
      }
      publishState(); if (state.settings.locale) setLocale(state.settings.locale)
      return copy(state)
    },
    onNavigate: listener => subscribe(subscribers.navigate, listener),
    openSaveFolder: downloadProfile,
    exportSave: downloadProfile,
    // Reload after exporting: retrying here could overwrite another tab's newer checkpoint.
    reportRuntimeError: async message => stopRuntime(message),
    reloadAfterRuntimeError: () => { if (state.runtimeError) { sessionStorage.setItem(RUNTIME_PAUSED_KEY, '1'); window.location.reload() } },
    retrySave: async () => false,
    getStore: async () => storeView(),
    purchaseProduct: async () => declinePurchase(),
    equipCosmetic: async sku => {
      if (state.runtimeError) throw new Error(state.runtimeError)
      if (sku !== null) return { ok: false, reason: '購入済みの外観がありません。試着をご利用ください。', view: storeView() }
      clearPreview(); return { ok: true, view: storeView() }
    },
    previewCosmetic: async sku => {
      if (state.runtimeError) throw new Error(state.runtimeError)
      if (sku === null) { clearPreview(); return true }
      const product = catalog.find(entry => entry.sku === sku)
      if (!product) return false
      clearPreview(); state.appearance = copy(product.theme); publishState()
      previewTimer = setTimeout(clearPreview, PREVIEW_MS)
      return true
    },
  }
  window.game = api
  const tick = () => {
    const at = Date.now(), elapsed = Math.max(0, at - lastTick); lastTick = at
    if (suspendedAt !== null || state.paused || storageBlocked || state.runtimeError) return
    if (elapsed >= SLEEP_GAP_MS) { offline(elapsed); accumulated = 0; persist(at); publishView(); return }
    accumulated += elapsed
    let steps = 0, changed = false, cleared = false
    const events: SimEvent[] = []
    while (accumulated >= balance.tickMs && steps < MAX_STEPS) {
      const result = advance(game); events.push(...result.events); changed ||= result.changed; cleared ||= result.stageCleared
      accumulated -= balance.tickMs; steps++
    }
    if (steps) emit(subscribers.frame, currentFrame(events))
    if (changed && at - lastView >= VIEW_INTERVAL_MS) { lastView = at; publishView() }
    if (cleared || at - lastSave >= AUTOSAVE_MS) persist(at)
  }
  function suspend() {
    if (suspendedAt !== null) return
    const at = Date.now(); tick(); persist(at); accumulated = 0; suspendedAt = at; lastTick = at
  }
  function resume() {
    // pageshow can fire for a restored or newly opened background tab before it actually becomes visible.
    if (document.hidden || suspendedAt === null) return
    const at = Date.now(), elapsed = at - suspendedAt
    suspendedAt = null; lastTick = at; accumulated = 0
    if (!storageBlocked && !state.runtimeError) { offline(elapsed); persist(at); publishView(); emit(subscribers.frame, currentFrame()) }
  }
  tickTimer = setInterval(() => { try { tick() } catch (error) { stopRuntime(reportRendererError('Game update failed', error, false)) } }, balance.tickMs)
  window.addEventListener('pagehide', suspend)
  window.addEventListener('pageshow', resume)
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else resume() })
  window.addEventListener('resize', () => emit(subscribers.layout, currentLayout()))
  window.addEventListener('storage', event => {
    try {
      if (event.storageArea !== null && event.storageArea !== localStorage) return
      if ((event.key === STORAGE_KEY || event.key === null) && localStorage.getItem(STORAGE_KEY) !== stored) blockStorage('別の画面で保存データが更新されました。重複した画面を閉じ、読み直してください。')
    } catch (error) { blockStorage(reportRendererError('保存領域にアクセスできなくなったため、一時停止しました。保存データを保護してから読み直してください。', error, false)) }
  })
  return api
}
