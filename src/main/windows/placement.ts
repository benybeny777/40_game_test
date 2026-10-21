import type { DisplaySize, StripLayout } from '../../shared/api'
export interface Area { x: number; y: number; width: number; height: number }

export const PLAY_DOTS = 32
export const HEADROOM_DIP = 72
const sizeMul: Record<DisplaySize, number> = { small: 0.75, medium: 1, large: 1.25 }

/** One dot = an integer number of physical pixels, so pixel art never blurs at 125%/150% scaling (02-strip.md §1). */
export function dotPxFor(scaleFactor: number, size: DisplaySize = 'medium') {
  return Math.max(2, Math.round(2.5 * scaleFactor * sizeMul[size]))
}
// Electron screen coordinates are DIP, including on mixed-DPI monitors.
export function stripLayout(workArea: Area, scaleFactor: number, size: DisplaySize = 'medium'): { bounds: Area; layout: StripLayout } {
  const dotPx = dotPxFor(scaleFactor, size)
  const height = Math.min(workArea.height, Math.ceil(PLAY_DOTS * dotPx / scaleFactor) + HEADROOM_DIP)
  return {
    bounds: { x: workArea.x, y: workArea.y + workArea.height - height, width: workArea.width, height },
    layout: { dotPx, playDots: PLAY_DOTS, scaleFactor, headroomDip: HEADROOM_DIP },
  }
}
