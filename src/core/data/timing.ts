import { balance } from './balance.ts'

/** Simulation durations stay deterministic; presentation and hosts share this real-time tempo. */
export const GAME_SPEED = 2
export const REAL_TICK_MS = balance.tickMs / GAME_SPEED
export const realSeconds = (simulationMs: number): number => simulationMs / (1000 * GAME_SPEED)
