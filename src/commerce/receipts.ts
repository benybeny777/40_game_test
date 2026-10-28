import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import type { PurchaseReceipt } from './service.ts'

/** Canonical payload signed by our future trusted transaction server, NOT a Steam-issued binary inventory signature. */
export const receiptPayload = (receipt: Omit<PurchaseReceipt, 'signature'>) => Buffer.from(JSON.stringify([
  'hyakkiko-purchase-v1', receipt.appId, receipt.steamId, receipt.orderId, receipt.sku, receipt.receiptId,
]))

/** The transaction server must finalize/verify Steam Wallet payment before signing this entitlement. */
export function createServerReceiptVerifier(publicKey: string | KeyObject, expected: { appId: number; steamId: string }) {
  if (!Number.isSafeInteger(expected.appId) || expected.appId <= 0 || !/^\d{17}$/.test(expected.steamId)) throw new Error('invalid receipt account scope')
  const key = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('receipt key must be Ed25519')
  return (receipt: PurchaseReceipt): boolean => {
    if (!receipt || typeof receipt !== 'object' || receipt.appId !== expected.appId || receipt.steamId !== expected.steamId
      || ![receipt.sku, receipt.orderId, receipt.receiptId].every(value => typeof value === 'string' && value.length > 0)
      || typeof receipt.signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(receipt.signature)) return false
    try {
      const signature = Buffer.from(receipt.signature, 'base64')
      return signature.length === 64 && signature.toString('base64') === receipt.signature && verify(null, receiptPayload(receipt), key, signature)
    } catch { return false }
  }
}
