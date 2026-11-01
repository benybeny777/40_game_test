import { dojo, type DojoKey } from '../data/progress.ts'

export const availableDojoKeys = (Object.keys(dojo) as DojoKey[]).filter(key => !dojo[key].retired)
export interface DojoRefund { revision: 2; atkLevels: number; hpLevels: number; totalAmount: string; creditedAmount: string; pendingAmount: string }
export const noDojoRefund = (): DojoRefund => ({ revision: 2, atkLevels: 0, hpLevels: 0, totalAmount: '0', creditedAmount: '0', pendingAmount: '0' })
/** Historical purchase rule, independent of future character caps or shop prices. */
const historicalCost = { base: 100, growth: 1.5, exponentCap: 100 } as const
export const boundedDojoCost = (base: number, growth: number, level: number, exponentCap = 100) =>
  Math.floor(Math.min(Number.MAX_SAFE_INTEGER, base * growth ** Math.min(level, exponentCap)))

export function retiredDojoCost(levels: number): bigint {
  if (!Number.isSafeInteger(levels) || levels < 0) throw new Error('bad dojo refund: invalid purchased levels')
  let total = 0n
  for (let level = 0; level < levels; level++) {
    const cost = boundedDojoCost(historicalCost.base, historicalCost.growth, level, historicalCost.exponentCap)
    if (cost === Number.MAX_SAFE_INTEGER) return total + BigInt(cost) * BigInt(levels - level)
    total += BigInt(cost)
  }
  return total
}

function decimal(value: unknown): bigint {
  // At most two MAX_SAFE level counts, each priced at MAX_SAFE: fewer than 33 digits.
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,32})$/.test(value)) throw new Error('bad dojo refund: invalid decimal amount')
  return BigInt(value)
}
export function withdrawDojoRefund(record: DojoRefund, koban: number) {
  if (!Number.isFinite(koban) || koban < 0 || koban > Number.MAX_SAFE_INTEGER) throw new Error('bad dojo refund: invalid wallet')
  const pending = decimal(record.pendingAmount), room = BigInt(Number.MAX_SAFE_INTEGER) - BigInt(Math.ceil(koban))
  let amount = pending < room ? pending : room
  // Old saves allowed fractional balances. Do not erase that fraction when a
  // large integer refund would exceed the wallet's floating-point precision.
  while (amount > 0n && (koban + Number(amount) - Number(amount) !== koban || koban + Number(amount) - koban !== Number(amount))) amount /= 2n
  return { koban: koban + Number(amount), amount: Number(amount), record: { ...record,
    creditedAmount: (decimal(record.creditedAmount) + amount).toString(), pendingAmount: (pending - amount).toString() } }
}

export function migrateDojoRefund(raw: unknown, dojo: Record<DojoKey, number>, koban: number) {
  if (raw !== undefined) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('bad dojo refund: expected object')
    const record = raw as Record<string, unknown>
    if ((record.revision !== 1 && record.revision !== 2) || !Number.isSafeInteger(record.atkLevels) || (record.atkLevels as number) < 0
      || !Number.isSafeInteger(record.hpLevels) || (record.hpLevels as number) < 0) throw new Error('bad dojo refund: invalid revision or amounts')
    const expected = retiredDojoCost(record.atkLevels as number) + retiredDojoCost(record.hpLevels as number)
    if (dojo.atk !== 0 || dojo.hp !== 0) throw new Error('bad dojo refund: inconsistent completed migration')
    let credited: bigint, pending: bigint
    if (record.revision === 1) {
      if (!Number.isSafeInteger(record.amount) || (record.amount as number) < 0 || BigInt(record.amount as number) !== expected) throw new Error('bad dojo refund: inconsistent legacy amount')
      credited = expected; pending = 0n
    } else {
      credited = decimal(record.creditedAmount); pending = decimal(record.pendingAmount)
      if (decimal(record.totalAmount) !== expected || credited + pending !== expected) throw new Error('bad dojo refund: inconsistent amounts')
    }
    return { dojo, koban, record: { revision: 2, atkLevels: record.atkLevels, hpLevels: record.hpLevels,
      totalAmount: expected.toString(), creditedAmount: credited.toString(), pendingAmount: pending.toString() } as DojoRefund }
  }
  const amount = retiredDojoCost(dojo.atk) + retiredDojoCost(dojo.hp)
  const refund = withdrawDojoRefund({ revision: 2, atkLevels: dojo.atk, hpLevels: dojo.hp, totalAmount: amount.toString(), creditedAmount: '0', pendingAmount: amount.toString() }, koban)
  return { dojo: { ...dojo, atk: 0, hp: 0 }, koban: refund.koban, record: refund.record }
}
