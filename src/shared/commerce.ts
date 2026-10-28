/** Serializable commerce contract. No Steam credentials, account IDs or receipt signatures cross into the renderer. */
export interface ThemeDefinition {
  id: string; band: string; line: string; dotA: string; dotB: string; prop: string; propHeight: number
}
export interface StorePrice { amount: number; currency: string; formatted: string }
export interface StoreProduct {
  sku: string; name: string; description: string; price: StorePrice | null
  owned: boolean; equipped: boolean; purchasable: boolean; theme: ThemeDefinition
}
export interface StoreView {
  mode: 'unavailable' | 'sandbox' | 'live'; message: string; products: StoreProduct[]
  equippedSku: string | null; appearance: ThemeDefinition | null; pending: boolean
  market: { available: false; message: string }; error?: string
}
export type CommerceResult = { ok: true; view: StoreView } | { ok: false; reason: string; view: StoreView }
