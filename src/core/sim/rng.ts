import { balance } from '../data/balance.ts'
export function random(state: { rng: number }): number {
  const p = balance.rng
  state.rng = (state.rng + p.increment) >>> 0
  let value = state.rng
  value = Math.imul(value ^ (value >>> p.shiftA), value | 1)
  value ^= value + Math.imul(value ^ (value >>> p.shiftB), value | p.mix)
  return ((value ^ (value >>> p.shiftC)) >>> 0) / p.divisor
}
