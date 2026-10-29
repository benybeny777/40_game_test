import { balance } from '../data/balance.ts'
import { realSeconds } from '../data/timing.ts'
export const ticks = (ms: number) => Math.ceil(ms / balance.tickMs)
/** Display the same scheduled duration as combat, including its fixed-tick rounding. */
export const realTickSeconds = (simulationMs: number) => realSeconds(ticks(simulationMs) * balance.tickMs)
export const FOREVER = Number.MAX_SAFE_INTEGER
