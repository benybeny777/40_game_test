import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateKeyPairSync, sign } from 'node:crypto'
import { CommerceService, type CommerceProvider, type PaymentResult } from '../src/commerce/service.ts'
import { catalog } from '../src/commerce/catalog.ts'
import { createServerReceiptVerifier, receiptPayload } from '../src/commerce/receipts.ts'

const temporary: string[] = []
const path = () => { const dir = mkdtempSync(join(tmpdir(), 'hyakkiko-commerce-')); temporary.push(dir); return join(dir, 'store.json') }
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function provider(): CommerceProvider {
  return { getPrice: () => ({ amount: 200, currency: 'JPY', formatted: '¥200' }),
    purchase: vi.fn<CommerceProvider['purchase']>(async order => ({ status: 'paid', receipt: { ...order, receiptId: `steam:${order.orderId}`, signature: 'verified' } })),
    verifyReceipt: receipt => receipt.signature === 'verified' }
}
const steamId = '76561198000000000'
const live = (file: string, payment: CommerceProvider) => new CommerceService({ path: file, profile: 'user', sandbox: false, appId: 123456, steamId, provider: payment })

describe('外観ストア・所有権・取引状態', () => {
  it('Steam未接続時は価格を捏造せず購入と所有権付与を拒否する', async () => {
    const service = new CommerceService({ path: path(), profile: 'user', sandbox: false })
    expect(service.getView().mode).toBe('unavailable')
    expect(service.getView().products.every(product => !product.purchasable && product.price === null && !product.owned)).toBe(true)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(service.equip(catalog[0].sku).ok).toBe(false)
    expect(service.getAppearance()).toBeNull()
  })
  it('利用者プロファイルではsandboxフラグを指定してもテスト購入を許可しない', async () => {
    const service = new CommerceService({ path: path(), profile: 'user', sandbox: true, packaged: false })
    expect(service.getView().mode).toBe('unavailable')
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
  })
  it('配布版ではdevプロファイルとsandbox指定があってもテスト購入を許可しない', async () => {
    const service = new CommerceService({ path: path(), profile: 'dev', sandbox: true, packaged: true })
    expect(service.getView().mode).toBe('unavailable')
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
  })
  it('開発sandboxで購入・外観反映・再起動復元・既定外観へ戻す', async () => {
    const file = path(), options = { path: file, profile: 'dev' as const, sandbox: true, packaged: false }
    const service = new CommerceService(options)
    expect(service.getView().message).toContain('実決済は発生しません')
    const bought = await service.purchase(catalog[0].sku)
    expect(bought.ok).toBe(true); expect(bought.view.pending).toBe(false)
    expect(service.equip(catalog[0].sku).ok).toBe(true)
    const restored = new CommerceService(options)
    expect(restored.getAppearance()?.id).toBe(catalog[0].theme.id)
    expect(restored.getView().products[0].owned).toBe(true)
    expect(restored.equip(null).ok).toBe(true); expect(restored.getAppearance()).toBeNull()
    expect(new CommerceService(options).getView().equippedSku).toBeNull()
  })
  it('所有済み商品の重複購入は新しい注文を作らない', async () => {
    const file = path(), service = new CommerceService({ path: file, profile: 'dev', sandbox: true, packaged: false })
    await service.purchase(catalog[0].sku); await service.purchase(catalog[0].sku)
    expect(JSON.parse(readFileSync(file, 'utf8')).transactions).toHaveLength(1)
    expect(service.equip(catalog[1].sku).ok).toBe(false)
    expect((await service.purchase('unknown')).ok).toBe(false)
  })
  it('未確認の支払いは再購入せず、再起動後もブロックする', async () => {
    const file = path(), payment = provider()
    payment.purchase = vi.fn<CommerceProvider['purchase']>(async () => ({ status: 'unknown' }))
    const service = live(file, payment)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect((await live(file, payment).purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).toHaveBeenCalledTimes(1)
    expect(service.getView().products[0].owned).toBe(false)
  })
  it('例外で結果が不明な支払いも自動再送しない', async () => {
    const file = path(), payment = provider()
    payment.purchase = vi.fn<CommerceProvider['purchase']>(async () => { throw new Error('network response lost') })
    const service = live(file, payment)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).toHaveBeenCalledTimes(1)
    expect(service.getView().pending).toBe(true)
  })
  it('中断時に保存されたpending注文は起動後unknownとして扱う', async () => {
    const file = path()
    writeFileSync(file, JSON.stringify({ version: 1, scope: 'live', owned: [], equippedSku: null, transactions: [{ orderId: 'old', sku: catalog[0].sku, status: 'pending' }] }))
    const payment = provider(), service = live(file, payment)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).not.toHaveBeenCalled()
  })
  it('署名・AppID・商品・注文の照合が一致しないレシートを拒否する', async () => {
    for (const altered of [{ signature: 'forged' }, { appId: 7 }, { steamId: '76561198000000001' }, { sku: catalog[1].sku }, { orderId: 'another' }]) {
      const payment = provider()
      payment.purchase = vi.fn<CommerceProvider['purchase']>(async order => ({ status: 'paid', receipt: { ...order, receiptId: 'r', signature: 'verified', ...altered } }))
      const service = live(path(), payment)
      expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
      expect(service.getView().products[0].owned).toBe(false)
      expect(service.getView().pending).toBe(true)
    }
  })
  it('同じレシートを別の商品へ再利用できない', async () => {
    const payment = provider()
    payment.purchase = vi.fn<CommerceProvider['purchase']>(async order => ({ status: 'paid', receipt: { ...order, receiptId: 'same-receipt', signature: 'verified' } }))
    const service = live(path(), payment)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(true)
    expect((await service.purchase(catalog[1].sku)).ok).toBe(false)
    expect(service.getView().products.filter(product => product.owned)).toHaveLength(1)
  })
  it('製品のローカル記録だけで所有権を復元せず、二重購入も拒否する', async () => {
    const file = path(), payment = provider(), service = live(file, payment)
    await service.purchase(catalog[0].sku); service.equip(catalog[0].sku)
    const restored = live(file, payment)
    expect(restored.getView().products[0].owned).toBe(false)
    expect(restored.getAppearance()).toBeNull()
    expect((await restored.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).toHaveBeenCalledTimes(1)
  })
  it('同時クリックでは支払いを1回しか呼ばない', async () => {
    const payment = provider()
    let resolve: (result: PaymentResult) => void = () => {}
    payment.purchase = vi.fn<CommerceProvider['purchase']>(() => new Promise<PaymentResult>(done => { resolve = done }))
    const service = live(path(), payment), first = service.purchase(catalog[0].sku)
    expect((await service.purchase(catalog[1].sku)).ok).toBe(false)
    resolve({ status: 'cancelled' }); expect((await first).ok).toBe(false)
    expect(payment.purchase).toHaveBeenCalledTimes(1)
    expect(service.getView().pending).toBe(false)
  })
  it('キャンセル確定後は本人操作の再購入ができる', async () => {
    const payment = provider()
    payment.purchase = vi.fn<CommerceProvider['purchase']>(async () => ({ status: 'cancelled' }))
    const service = live(path(), payment)
    await service.purchase(catalog[0].sku); await service.purchase(catalog[0].sku)
    expect(payment.purchase).toHaveBeenCalledTimes(2)
  })
  it('価格の未取得・異常な金額では支払いを開始しない', async () => {
    const payment = provider(); payment.getPrice = () => ({ amount: -1, currency: 'JPY', formatted: 'bad' })
    const service = live(path(), payment)
    expect(service.getView().products[0].price).toBeNull()
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).not.toHaveBeenCalled()
  })
  it('壊れたストア記録は上書きせず、所有権を付与しない', async () => {
    const file = path(); writeFileSync(file, '{broken')
    const service = new CommerceService({ path: file, profile: 'dev', sandbox: true, packaged: false })
    expect(service.getView().error).toBeDefined()
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe('{broken')
  })
  it('sandbox記録を製品側で読み込んでも所有権を得られない', async () => {
    const file = path(), sandbox = new CommerceService({ path: file, profile: 'dev', sandbox: true, packaged: false })
    await sandbox.purchase(catalog[0].sku)
    const service = live(file, provider())
    expect(service.getView().error).toBeDefined()
    expect(service.getView().products[0].owned).toBe(false)
  })
  it('Viewの書換えは所有権と外観定義を変更しない', () => {
    const service = new CommerceService({ path: path(), profile: 'dev', sandbox: true, packaged: false })
    const view = service.getView(); view.products[0].theme.line = '#000'; view.products[0].owned = true
    expect(service.getView().products[0].owned).toBe(false)
    expect(service.getView().products[0].theme.line).not.toBe('#000')
  })
  it('サーバー署名は商品・注文・Steamアカウントの改変を検出する', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const receipt = { appId: 123456, steamId, sku: catalog[0].sku, orderId: 'order1', receiptId: 'receipt1', signature: '' }
    receipt.signature = sign(null, receiptPayload(receipt), privateKey).toString('base64')
    const verify = createServerReceiptVerifier(publicKey, { appId: 123456, steamId })
    expect(verify(receipt)).toBe(true)
    expect(verify({ ...receipt, sku: catalog[1].sku })).toBe(false)
    expect(verify({ ...receipt, orderId: 'order2' })).toBe(false)
    expect(verify({ ...receipt, steamId: '76561198000000001' })).toBe(false)
  })
})


describe('購入記録の排他・保存・アカウント境界', () => {
  it('先に生成された別サービスも保存済み注文を読み直し、同一商品を二重購入しない', async () => {
    const file = path(), payment = provider(), first = live(file, payment), stale = live(file, payment)
    const pending = first.purchase(catalog[0].sku)
    expect((await stale.purchase(catalog[0].sku)).ok).toBe(false)
    expect((await pending).ok).toBe(true)
    expect((await stale.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).toHaveBeenCalledTimes(1)
    expect(JSON.parse(readFileSync(file, 'utf8')).transactions).toHaveLength(1)
  })
  it('別商品を別サービスで同時購入しても注文を失わず、検証済みの所有権を保持する', async () => {
    const file = path(), payment = provider()
    const resolutions: Array<(result: PaymentResult) => void> = [], orders: Array<Parameters<CommerceProvider['purchase']>[0]> = []
    payment.purchase = vi.fn<CommerceProvider['purchase']>(order => { orders.push(order); return new Promise(done => resolutions.push(done)) })
    const a = live(file, payment), b = live(file, payment)
    const boughtA = a.purchase(catalog[0].sku), boughtB = b.purchase(catalog[1].sku)
    resolutions[1]({ status: 'paid', receipt: { ...orders[1], receiptId: 'receipt-b', signature: 'verified' } })
    expect((await boughtB).ok).toBe(true)
    resolutions[0]({ status: 'paid', receipt: { ...orders[0], receiptId: 'receipt-a', signature: 'verified' } })
    expect((await boughtA).ok).toBe(true)
    const stored = JSON.parse(readFileSync(file, 'utf8'))
    expect(stored.transactions).toHaveLength(2)
    expect(stored.transactions.every((order: { status: string }) => order.status === 'paid')).toBe(true)
    expect(b.equip(catalog[1].sku).ok).toBe(true)
    expect(a.equip(catalog[0].sku).ok).toBe(true)
    expect(payment.purchase).toHaveBeenCalledTimes(2)
  })
  it('他アカウントまたはAppIDの記録を流用して購入・所有権付与しない', async () => {
    const file = path(), payment = provider()
    await live(file, payment).purchase(catalog[0].sku)
    for (const scope of [{ appId: 123457, steamId }, { appId: 123456, steamId: '76561198000000001' }]) {
      const other = new CommerceService({ path: file, profile: 'user', sandbox: false, ...scope, provider: payment })
      expect(other.getView().error).toBeDefined()
      expect(other.getView().products.every(product => !product.owned)).toBe(true)
      expect((await other.purchase(catalog[1].sku)).ok).toBe(false)
    }
    expect(payment.purchase).toHaveBeenCalledTimes(1)
  })
  it('配布版または利用者のsandbox指定を実決済へフォールバックしない', async () => {
    const payment = provider()
    for (const settings of [{ profile: 'dev' as const, packaged: true }, { profile: 'user' as const, packaged: false }]) {
      const service = new CommerceService({ path: path(), ...settings, sandbox: true, appId: 123456, steamId, provider: payment })
      expect(service.getView().mode).toBe('unavailable')
      expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    }
    expect(payment.purchase).not.toHaveBeenCalled()
  })
  it('注文の初回保存に失敗したら支払いを呼ばない', async () => {
    const file = path(), payment = provider(); mkdirSync(file + '.tmp')
    const service = live(file, payment)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).not.toHaveBeenCalled()
    expect(service.getView().products[0].owned).toBe(false)
    expect(existsSync(file)).toBe(false)
  })
  it('支払い後の確定保存に失敗したら成功や所有権を返さず、注文を再送しない', async () => {
    const file = path(), payment = provider()
    payment.purchase = vi.fn<CommerceProvider['purchase']>(async order => {
      renameSync(file, file + '.pending'); mkdirSync(file)
      return { status: 'paid', receipt: { ...order, receiptId: 'charged', signature: 'verified' } }
    })
    const service = live(file, payment)
    const result = await service.purchase(catalog[0].sku)
    expect(result.ok).toBe(false); expect(result.view.products[0].owned).toBe(false)
    expect(service.getAppearance()).toBeNull()
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect((await live(file, payment).purchase(catalog[0].sku)).ok).toBe(false)
    const originalOrder = live(file + '.pending', payment)
    expect(originalOrder.getView().pending).toBe(true)
    expect((await originalOrder.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).toHaveBeenCalledTimes(1)
  })
  it('初期ローカルファイルのscope・アカウント・paid状態を偽装しても本番所有権を付与しない', async () => {
    const file = path(), payment = provider()
    writeFileSync(file, JSON.stringify({ version: 1, scope: 'live', account: { appId: 123456, steamId }, owned: [catalog[0].sku], equippedSku: catalog[0].sku,
      transactions: [{ orderId: 'forged-order', sku: catalog[0].sku, status: 'paid', receiptId: 'forged-receipt' }] }))
    const service = live(file, payment)
    expect(service.getView().products[0].owned).toBe(false)
    expect(service.getAppearance()).toBeNull()
    expect(service.equip(catalog[0].sku).ok).toBe(false)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).not.toHaveBeenCalled()
  })
  it('中断した排他記録は勝手に削除・再送せず、購入を安全に停止する', async () => {
    const file = path(), payment = provider()
    writeFileSync(file + '.lock', JSON.stringify({ pid: 1, token: 'another-owner' }))
    const service = live(file, payment)
    expect((await service.purchase(catalog[0].sku)).ok).toBe(false)
    expect(payment.purchase).not.toHaveBeenCalled()
    expect(existsSync(file + '.lock')).toBe(true)
  })
  it('別issuer鍵と不正形式の署名を拒否し、検証APIは不正入力を例外にしない', () => {
    const issuer = generateKeyPairSync('ed25519'), other = generateKeyPairSync('ed25519')
    const receipt = { appId: 123456, steamId, sku: catalog[0].sku, orderId: 'order1', receiptId: 'r1', signature: '' }
    receipt.signature = sign(null, receiptPayload(receipt), issuer.privateKey).toString('base64')
    const verify = createServerReceiptVerifier(issuer.publicKey, { appId: 123456, steamId })
    expect(createServerReceiptVerifier(other.publicKey, { appId: 123456, steamId })(receipt)).toBe(false)
    expect(verify({ ...receipt, receiptId: '' })).toBe(false)
    expect(verify({ ...receipt, signature: 'AAAA' })).toBe(false)
    expect(verify(null as unknown as typeof receipt)).toBe(false)
    expect(verify({ ...receipt, signature: receipt.signature + '=' })).toBe(false)
  })
})
