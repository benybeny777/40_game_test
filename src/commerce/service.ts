import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CommerceResult, StorePrice, StoreView, ThemeDefinition } from '../shared/commerce.ts'
import { catalog, findProduct } from './catalog.ts'

export interface PurchaseReceipt { orderId: string; sku: string; appId: number; steamId: string; receiptId: string; signature: string }
export type PaymentResult = { status: 'paid'; receipt: PurchaseReceipt } | { status: 'cancelled' | 'unknown' }
/** Trusted main/server adapter only. A returned "paid" flag alone is never an entitlement. */
export interface CommerceProvider {
  getPrice(sku: string): StorePrice | null
  purchase(order: { orderId: string; sku: string; appId: number; steamId: string }): Promise<PaymentResult>
  verifyReceipt(receipt: PurchaseReceipt): boolean
}
export interface CommerceOptions { path: string; profile: 'dev' | 'user'; sandbox: boolean; packaged?: boolean; appId?: number; steamId?: string; provider?: CommerceProvider }
type Transaction = { orderId: string; sku: string; status: 'pending' | 'unknown' | 'paid' | 'cancelled'; receiptId?: string }
interface StoreState { version: 1; scope: 'sandbox' | 'live'; account?: { appId: number; steamId: string }; owned: string[]; equippedSku: string | null; transactions: Transaction[] }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const validAppId = (value: number | undefined): value is number => Number.isSafeInteger(value) && value! > 0

export class CommerceService {
  private readonly mode: StoreView['mode']
  private state: StoreState
  private error: string | undefined
  private busy = false
  private readonly verifiedOwned = new Map<string, string>()

  constructor(private readonly options: CommerceOptions) {
    this.mode = options.sandbox ? options.profile === 'dev' && options.packaged === false ? 'sandbox' : 'unavailable'
      : validAppId(options.appId) && /^\d{17}$/.test(options.steamId ?? '') && options.provider ? 'live' : 'unavailable'
    this.state = { version: 1, scope: this.mode === 'sandbox' ? 'sandbox' : 'live', ...(this.mode === 'live' ? { account: { appId: options.appId!, steamId: options.steamId! } } : {}), owned: [], equippedSku: null, transactions: [] }
    // A local file cannot grant production entitlements. Live adapters must revalidate ownership on startup.
    // Until that sync exists, live cached ownership is intentionally not restored.
    if (this.mode === 'unavailable' || !existsSync(options.path)) return
    try {
      this.reload()
    } catch {
      this.error = 'ストア記録を読み込めません。購入と外観の変更を停止しました。'
    }
  }

  private validate(value: unknown): StoreState {
    if (!isRecord(value) || value.version !== 1 || value.scope !== this.state.scope || !Array.isArray(value.owned) || !Array.isArray(value.transactions)
      || value.owned.some(sku => typeof sku !== 'string' || !findProduct(sku)) || new Set(value.owned).size !== value.owned.length
      || (value.equippedSku !== null && (typeof value.equippedSku !== 'string' || !value.owned.includes(value.equippedSku)))) throw new Error('bad store state')
    if (this.mode === 'live' && (!isRecord(value.account) || value.account.appId !== this.options.appId || value.account.steamId !== this.options.steamId)) throw new Error('store account mismatch')
    const orderIds = new Set<string>(), receiptIds = new Set<string>()
    for (const transaction of value.transactions) {
      if (!isRecord(transaction) || typeof transaction.orderId !== 'string' || !transaction.orderId || orderIds.has(transaction.orderId)
        || typeof transaction.sku !== 'string' || !findProduct(transaction.sku) || !['pending', 'unknown', 'paid', 'cancelled'].includes(String(transaction.status))
        || (transaction.status === 'paid' && (typeof transaction.receiptId !== 'string' || !transaction.receiptId || receiptIds.has(transaction.receiptId)))) throw new Error('bad transaction')
      orderIds.add(transaction.orderId)
      if (typeof transaction.receiptId === 'string') receiptIds.add(transaction.receiptId)
    }
    for (const sku of value.owned) if (!value.transactions.some(transaction => isRecord(transaction) && transaction.sku === sku && transaction.status === 'paid')) throw new Error('unreceipted ownership')
    return structuredClone(value) as unknown as StoreState
  }

  private reload() {
    if (!existsSync(this.options.path)) {
      if (this.state.transactions.length) throw new Error('store disappeared')
      return
    }
    const state = this.validate(JSON.parse(readFileSync(this.options.path, 'utf8')))
    for (const transaction of state.transactions) if (transaction.status === 'pending') transaction.status = 'unknown'
    if (this.mode === 'live') {
      // Only entitlements verified in this running service may survive a local reload.
      state.owned = [...this.verifiedOwned].filter(([sku, receiptId]) => state.transactions.some(transaction => transaction.status === 'paid'
        && transaction.sku === sku && transaction.receiptId === receiptId)).map(([sku]) => sku)
      if (!state.owned.includes(state.equippedSku ?? '')) state.equippedSku = null
    }
    this.state = state
  }

  /** Short filesystem exclusion covers reload + write; no lock is held while awaiting payment. */
  private withStoreLock<T>(operation: () => T): T {
    mkdirSync(dirname(this.options.path), { recursive: true })
    const lock = this.options.path + '.lock'
    // A surviving lock after a crash is deliberately fail-closed; never delete another process's lock.
    const fd = openSync(lock, 'wx')
    try {
      writeFileSync(fd, JSON.stringify({ pid: process.pid, token: randomUUID() }))
      return operation()
    } finally {
      closeSync(fd)
      unlinkSync(lock)
    }
  }

  private persist() {
    const temp = `${this.options.path}.tmp`
    mkdirSync(dirname(this.options.path), { recursive: true })
    const fd = openSync(temp, 'w')
    try { writeFileSync(fd, JSON.stringify(this.state, null, 2)); fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(temp, this.options.path)
  }

  private persistOrStop(): boolean {
    try { this.persist(); return true } catch { this.error = 'ストア記録を保存できません。購入を停止しました。'; return false }
  }
  private fail(reason: string): CommerceResult { return { ok: false, reason, view: this.getView() } }
  private pendingSku(sku: string) { return this.state.transactions.some(transaction => transaction.sku === sku && (transaction.status === 'pending' || transaction.status === 'unknown'
    || this.mode === 'live' && transaction.status === 'paid' && !this.state.owned.includes(sku))) }
  private price(sku: string): StorePrice | null {
    if (this.mode !== 'live') return null
    try {
      const price = this.options.provider!.getPrice(sku)
      return price && Number.isSafeInteger(price.amount) && price.amount >= 0 && /^[A-Z]{3}$/.test(price.currency)
        && typeof price.formatted === 'string' && price.formatted.length > 0 && price.formatted.length < 100 ? { ...price } : null
    } catch { return null }
  }

  getAppearance(): ThemeDefinition | null {
    return this.state.equippedSku && this.state.owned.includes(this.state.equippedSku) && !this.error
      ? structuredClone(findProduct(this.state.equippedSku)!.theme) : null
  }

  getView(): StoreView {
    const enabled = this.mode !== 'unavailable' && !this.error
    return { mode: this.mode, message: this.mode === 'sandbox' ? '開発テスト：実決済は発生しません。テスト所有権は製品版へ移りません。'
      : this.mode === 'live' ? '購入の確定はSteamの確認結果を受け取った後に行います。' : '現在は販売前です。Steam決済の接続後に購入できるようになります。',
      products: catalog.map(product => ({ sku: product.sku, name: product.name, description: product.description, theme: structuredClone(product.theme),
        price: this.price(product.sku),
        owned: enabled && this.state.owned.includes(product.sku), equipped: enabled && this.state.equippedSku === product.sku,
        purchasable: enabled && !this.busy && !this.state.owned.includes(product.sku) && !this.pendingSku(product.sku) && (this.mode === 'sandbox' || this.price(product.sku) !== null) })),
      equippedSku: enabled ? this.state.equippedSku : null, appearance: enabled ? this.getAppearance() : null,
      pending: this.busy || catalog.some(product => this.pendingSku(product.sku)),
      market: { available: false, message: 'Steamマーケット取引は準備中です。ローカルの装備・小判は取引できません。' },
      ...(this.error ? { error: this.error } : {}) }
  }

  async purchase(sku: string): Promise<CommerceResult> {
    if (!findProduct(sku)) return this.fail('不明な商品です。')
    if (this.error) return this.fail(this.error)
    if (this.mode === 'unavailable') return this.fail('現在は販売前です。購入はまだできません。')
    if (this.busy) return this.fail('購入の確認中です。完了をお待ちください。')
    this.busy = true
    const finish = (reason?: string): CommerceResult => { this.busy = false; return reason ? this.fail(reason) : { ok: true, view: this.getView() } }
    let transaction: Transaction | undefined
    try {
      const preparation = this.withStoreLock(() => {
        this.reload()
        if (this.state.owned.includes(sku)) return 'owned'
        if (this.pendingSku(sku)) return '前回の購入結果が未確認です。再購入せず、取引の確認が必要です。'
        if (this.mode === 'live' && !this.price(sku)) return 'Steamの商品価格を確認できません。購入を開始していません。'
        transaction = { orderId: randomUUID(), sku, status: 'pending' }
        this.state.transactions.push(transaction)
        return this.persistOrStop() ? 'ready' : this.error!
      })
      if (preparation !== 'ready') return finish(preparation === 'owned' ? undefined : preparation)
      const order = transaction!
      let result: PaymentResult
      try {
        result = this.mode === 'sandbox'
          ? { status: 'paid', receipt: { orderId: order.orderId, sku, appId: 0, steamId: 'sandbox', receiptId: 'sandbox:' + order.orderId, signature: 'sandbox-only' } }
          : await this.options.provider!.purchase({ orderId: order.orderId, sku, appId: this.options.appId!, steamId: this.options.steamId! })
      } catch { result = { status: 'unknown' } }
      const reason = this.withStoreLock(() => {
        this.reload()
        const current = this.state.transactions.find(candidate => candidate.orderId === order.orderId && candidate.sku === sku)
        if (!current || (current.status !== 'pending' && current.status !== 'unknown')) throw new Error('transaction changed')
        if (result.status === 'cancelled') {
          current.status = 'cancelled'; this.persistOrStop()
          return this.error ?? '購入はキャンセルされました。'
        }
        current.status = 'unknown'
        if (result.status !== 'paid') { this.persistOrStop(); return this.error ?? '購入結果を確認できませんでした。自動で再購入しません。' }
        const receipt = result.receipt
        const verified = isRecord(receipt) && receipt.orderId === current.orderId && receipt.sku === sku && typeof receipt.receiptId === 'string' && receipt.receiptId.length > 0
          && !this.state.transactions.some(previous => previous !== current && previous.receiptId === receipt.receiptId)
          && (this.mode === 'sandbox' || receipt.appId === this.options.appId && receipt.steamId === this.options.steamId && this.options.provider!.verifyReceipt(receipt))
        if (!verified) { this.persistOrStop(); return this.error ?? '購入記録を検証できませんでした。所有権は追加していません。' }
        current.status = 'paid'; current.receiptId = receipt.receiptId; this.state.owned.push(sku)
        if (!this.persistOrStop()) { this.state.owned = this.state.owned.filter(owned => owned !== sku); current.status = 'unknown'; return this.error! }
        if (this.mode === 'live') this.verifiedOwned.set(sku, receipt.receiptId)
        return undefined
      })
      return finish(reason)
    } catch {
      this.error = transaction ? '購入結果の記録を確定できません。自動で再購入せず、取引の確認が必要です。' : 'ストア記録を安全に更新できません。購入を停止しました。'
      return finish(this.error)
    } finally { this.busy = false }
  }

  equip(sku: string | null): CommerceResult {
    if (this.error) return this.fail(this.error)
    if (this.mode === 'unavailable') return this.fail('外観の所有権を確認できません。')
    try {
      return this.withStoreLock(() => {
        this.reload()
        if (sku !== null && (!findProduct(sku) || !this.state.owned.includes(sku))) return this.fail('所有していない外観です。')
        const previous = this.state.equippedSku; this.state.equippedSku = sku
        if (!this.persistOrStop()) { this.state.equippedSku = previous; return this.fail(this.error!) }
        return { ok: true, view: this.getView() }
      })
    } catch {
      this.error = 'ストア記録を安全に更新できません。外観の変更を停止しました。'
      return this.fail(this.error)
    }
  }
}
