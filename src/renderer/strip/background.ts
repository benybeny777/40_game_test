import atlasUrl from '../../../assets/sprites/art/dungeon-backgrounds.png'
import { dungeonBalance } from '../../core/data/dungeon'

const panoramaWidth = 384, panoramaHeight = 80
// Reviewed row boundaries and walkable floor baselines in the selected source.
const rows = [{ top: 0, bottom: 347, floor: 319 }, { top: 347, bottom: 650, floor: 623 }, { top: 650, bottom: 1024, floor: 978 }]
const panoramas: HTMLCanvasElement[] = []
export const backgroundReady = (async () => {
  const image = new Image(); image.src = atlasUrl; await image.decode()
  for (const row of rows) {
    const canvas = document.createElement('canvas'); canvas.width = panoramaWidth; canvas.height = panoramaHeight
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false
    const sourceHeight = row.bottom - row.top
    // Normalize the source floor to row 74; source art remains intact on disk.
    const topHeight = row.floor - row.top
    ctx.drawImage(image, 0, row.top, image.width, topHeight, 0, 0, panoramaWidth, 74)
    ctx.drawImage(image, 0, row.floor, image.width, sourceHeight - topHeight, 0, 74, panoramaWidth, 6)
    panoramas.push(canvas)
  }
})()
export function backgroundTheme(depth: number, town = false) { return town ? 1 : Math.floor((Math.max(1, depth) - 1) / dungeonBalance.themeSpan) % rows.length }
export interface BackgroundScene { width: number; height: number; footY: number; baseX: number; depth: number; town: boolean; walkOffset: number }
/** A bounded desktop diorama; compact browser view uses the full battle surface. */
export function drawDungeonBackground(ctx: CanvasRenderingContext2D, scene: BackgroundScene) {
  const image = panoramas[backgroundTheme(scene.depth, scene.town)]
  if (!image) return
  const compact = scene.width <= 540
  const width = compact ? scene.width : Math.min(scene.width, Math.max(360, scene.baseX + 165))
  const height = compact ? scene.footY + 4 : Math.min(scene.footY + 4, 78)
  const top = scene.footY + 2 - Math.round(height * 74 / panoramaHeight)
  const tileWidth = Math.round(panoramaWidth * height / panoramaHeight)
  const offset = Math.floor(scene.walkOffset * .35) % tileWidth
  ctx.save(); ctx.imageSmoothingEnabled = false
  ctx.beginPath(); ctx.rect(0, Math.max(0, top), width, height); ctx.clip()
  for (let x = -offset; x < width; x += tileWidth) ctx.drawImage(image, x, top, tileWidth, height)
  // Foreground paving travels faster than the wall, giving walking a clear sense of depth.
  const floorOffset = Math.floor(scene.walkOffset) % tileWidth
  for (let x = -floorOffset; x < width; x += tileWidth) ctx.drawImage(image, 0, 74, panoramaWidth, 6, x, scene.footY + 2, tileWidth, Math.max(3, Math.round(height * 6 / panoramaHeight)))
  if (!compact) {
    // Discrete alpha steps keep the pixel grid while blending the diorama back into the desktop.
    ctx.globalCompositeOperation = 'destination-out'
    for (let step = 0; step < 8; step++) { ctx.fillStyle = `rgba(0,0,0,${(8 - step) / 9})`; ctx.fillRect(width - step * 2 - 2, top, 2, height) }
  }
  ctx.restore()
}
