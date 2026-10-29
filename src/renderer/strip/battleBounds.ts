/** Compact screens fill their battle surface; wide strips keep decoration near the party. */
export function battleSurfaceWidth(width: number, baseX: number): number {
  return width <= 540 ? width : Math.min(width, Math.max(360, baseX + 165))
}
