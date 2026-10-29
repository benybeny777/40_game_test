import type { CommerceResult, StoreProduct, StoreView, ThemeDefinition } from '../../shared/commerce.ts'
import './translations'
import { textElement as element } from './dom'

interface StoreHooks { updated: (next: StoreView) => void; toast: (message: string) => void }
let busy = false
let previewSku: string | null = null
let previewUntil = 0
let previewTimer: ReturnType<typeof setTimeout> | undefined

function sample(theme: ThemeDefinition) {
  const node = element('div', 'store-sample')
  node.setAttribute('aria-hidden', 'true')
  for (const [name, value] of Object.entries({ band: theme.band, line: theme.line, dotA: theme.dotA, dotB: theme.dotB, prop: theme.prop })) node.style.setProperty(`--store-${name}`, value)
  const ground = element('div', 'store-sample-ground')
  for (let i = 0; i < 11; i++) {
    const dot = element('i', i % 3 === 0 ? 'store-sample-dot store-sample-dot-a' : 'store-sample-dot')
    dot.style.left = `${i * 9 + 2}%`; ground.append(dot)
  }
  for (let i = 0; i < 4; i++) {
    const prop = element('i', 'store-sample-prop'); prop.style.left = `${i * 26 + 8}%`
    prop.style.height = `${Math.max(1, Math.min(4, theme.propHeight)) * 3}px`; ground.append(prop)
  }
  node.append(ground)
  return node
}

export function renderStore(view: StoreView, hooks: StoreHooks): HTMLElement {
  const root = element('section', 'store-root')
  const intro = element('div', 'store-intro')
  intro.append(element('span', 'store-eyebrow', '旅を彩る外観'), element('h2', 'store-title', '外観ストア'),
    element('p', 'store-description', '能力・経験値・ドロップ率を変えず、足元の雰囲気を楽しめます。'))
  const status = element('p', `store-status${view.mode === 'sandbox' ? ' store-status-sandbox' : ''}`,
    view.mode === 'sandbox' ? '開発テスト・実決済なし。テストで取得した外観は製品版へ移りません。' : view.message)
  root.append(intro, status)
  if (view.error) { const error = element('p', 'store-error', view.error); error.setAttribute('role', 'alert'); root.append(error) }
  if (view.pending) root.append(element('p', 'store-pending', '購入記録の確認待ちです。同じ商品を再購入せず、確認をお待ちください。'))
  const toolbar = element('div', 'store-toolbar')
  toolbar.append(element('span', 'store-preview-help', '未購入の外観も30秒間試着できます。'))
  const buttons: Array<{ node: HTMLButtonElement; enabled: boolean }> = []
  const updateButtons = () => { for (const button of buttons) button.node.disabled = busy || !button.enabled }
  const unreadableView = (error: unknown): StoreView => {
    console.error('Store state refresh failed', error)
    const message = 'ストアの最新状態を確認できません。操作を停止しました。状態を再確認してください。'
    hooks.toast(message)
    return { ...view, error: message, products: view.products.map(product => ({ ...product, purchasable: false })) }
  }
  const refresh = async (): Promise<StoreView> => {
    try { return await window.game.getStore() }
    catch (error) { return unreadableView(error) }
  }
  const action = async (operation: () => Promise<CommerceResult | boolean>, success?: string) => {
    if (busy) return
    busy = true; updateButtons()
    let next = view
    try {
      const result = await operation()
      if (typeof result === 'boolean') {
        if (result) { if (success) hooks.toast(success) }
        else hooks.toast('外観を試着できませんでした。もう一度お試しください。')
      } else {
        next = result.view
        if (!result.ok) hooks.toast(result.reason)
        else if (success) hooks.toast(success)
      }
    } catch (error) {
      console.error('Store operation response failed; purchase is not retried', error)
      hooks.toast('ストアとの通信を確認できませんでした。購入を繰り返さず、状態の更新をお待ちください。')
      // Readback only: never retry a purchase after an uncertain response.
      next = await refresh()
    } finally {
      busy = false; updateButtons(); hooks.updated(next)
    }
  }
  const button = (text: string, enabled: boolean, operation: () => Promise<CommerceResult | boolean>, success?: string, primary = false) => {
    const node = element('button', `store-button${primary ? ' store-button-primary' : ''}`, text)
    node.type = 'button'; node.disabled = busy || !enabled
    buttons.push({ node, enabled }); node.addEventListener('click', () => { void action(operation, success) })
    return node
  }
  const preview = async (sku: string | null) => {
    const result = await window.game.previewCosmetic(sku)
    if (!result) return false
    if (previewTimer) clearTimeout(previewTimer)
    previewSku = sku; previewUntil = sku ? Date.now() + 30000 : 0
    if (sku) previewTimer = setTimeout(() => {
      previewSku = null; previewUntil = 0
      void refresh().then(hooks.updated)
    }, 30050)
    return true
  }
  const previewActive = previewSku !== null && Date.now() < previewUntil
  toolbar.append(button(previewActive ? '試着を取り消す' : '試着なし', previewActive && !view.error, () => preview(null), '試着を取り消しました。'),
    button('既定の足元に戻す', view.equippedSku !== null && !view.error, async () => {
      const result = await window.game.equipCosmetic(null)
      if (result.ok) { if (previewTimer) clearTimeout(previewTimer); previewSku = null; previewUntil = 0 }
      return result
    }, '既定の足元に戻しました。'))
  if (view.error) toolbar.append(button('ストアの状態を再確認', true, async () => {
    const next = await refresh()
    return next.error ? { ok: false, reason: next.error, view: next } : { ok: true, view: next }
  }))
  root.append(toolbar)
  const grid = element('div', 'store-grid')
  for (const product of view.products) grid.append(productCard(product))
  root.append(grid)
  const market = element('div', 'store-market')
  market.append(element('h3', 'store-market-title', 'Steamアイテム取引は準備中'), element('p', 'store-market-description', view.market.message),
    element('p', 'store-market-note', '本編で集めた装備や小判は、外観ストアとは別に管理されます。'))
  root.append(market)
  return root

  function productCard(product: StoreProduct): HTMLElement {
    const card = element('article', `store-card${product.equipped ? ' store-card-equipped' : ''}`)
    card.dataset.sku = product.sku
    card.dataset.focusScope = `store-${product.sku}`
    card.append(sample(product.theme))
    const heading = element('div', 'store-card-heading')
    heading.append(element('h3', 'store-product-name', product.name))
    if (product.equipped) heading.append(element('span', 'store-owned store-equipped', '装備中'))
    else if (product.owned) heading.append(element('span', 'store-owned', '取得済み'))
    card.append(heading, element('p', 'store-product-description', product.description))
    const price = view.mode === 'sandbox' ? 'テスト取得・課金なし' : product.price?.formatted ?? '価格は販売開始時に表示'
    card.append(element('p', 'store-price', price))
    const actions = element('div', 'store-actions')
    actions.append(button(previewActive && previewSku === product.sku ? '試着中（30秒）' : '30秒間試着', !view.error, () => preview(product.sku), '30秒間の試着を開始しました。'))
    if (product.owned) {
      actions.append(button(product.equipped ? '装備中' : 'この外観を使う', !product.equipped && !view.error, async () => {
        const result = await window.game.equipCosmetic(product.sku)
        if (result.ok) { if (previewTimer) clearTimeout(previewTimer); previewSku = null; previewUntil = 0 }
        return result
      }, '外観を変更しました。', true))
    } else {
      const label = view.mode === 'sandbox' ? 'テスト取得（課金なし）' : view.mode === 'live' && product.price ? `${product.price.formatted}で購入` : '販売準備中'
      actions.append(button(label, product.purchasable && !view.error && (view.mode === 'sandbox' || view.mode === 'live' && product.price !== null),
        () => window.game.purchaseProduct(product.sku), view.mode === 'sandbox' ? '開発テスト用の外観を取得しました。実決済は発生していません。' : '外観を取得しました。', true))
    }
    card.append(actions)
    return card
  }
}
