import { balance } from '../data/balance.ts'
export const ticks = (ms: number) => Math.ceil(ms / balance.tickMs)
export const FOREVER = Number.MAX_SAFE_INTEGER
