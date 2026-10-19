export interface Area { x: number; y: number; width: number; height: number }
export const STRIP_HEIGHT = 96

// Electron screen coordinates are DIP, including on mixed-DPI monitors.
export function stripBounds(workArea: Area): Area {
  const height = Math.min(STRIP_HEIGHT, workArea.height)
  return { x: workArea.x, y: workArea.y + workArea.height - height, width: workArea.width, height }
}
