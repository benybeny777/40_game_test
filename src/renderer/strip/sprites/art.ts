import partyUrl from '../../../../assets/sprites/art/party-atlas.png'
import enemyUrl from '../../../../assets/sprites/art/enemy-atlas.png'
import { enemyArt, partyArt } from '../../../shared/art'
import type { Frame, Sheet } from './sheet'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return c
}
async function load(url: string) {
  const image = new Image(); image.src = url; await image.decode(); return image
}
/** Crop atlas cells to their alpha bounds; retain original pixels for the panel portraits. */
function crop(image: HTMLImageElement, left: number, top: number, right: number, bottom: number) {
  const cell = canvas(Math.round(right - left), Math.round(bottom - top)), ctx = cell.getContext('2d')!
  ctx.drawImage(image, Math.round(left), Math.round(top), cell.width, cell.height, 0, 0, cell.width, cell.height)
  const data = ctx.getImageData(0, 0, cell.width, cell.height).data
  let x0 = cell.width, y0 = cell.height, x1 = 0, y1 = 0
  for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) {
    if (data[(y * cell.width + x) * 4 + 3] < 64) continue
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  if (x0 > x1 || y0 > y1) throw new Error('Empty sprite atlas cell')
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1)
  out.getContext('2d')!.drawImage(cell, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}
function frame(source: HTMLCanvasElement, size: number, height: number): Frame {
  const normal = canvas(size, size), ctx = normal.getContext('2d')!
  const scale = Math.min(height / source.height, (size - 2) / source.width)
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, Math.floor((size - w) / 2), size - h, w, h)
  const flash = canvas(size, size), gray = canvas(size, size)
  const f = flash.getContext('2d')!, g = gray.getContext('2d')!
  f.drawImage(normal, 0, 0); f.globalCompositeOperation = 'source-atop'; f.fillStyle = '#fff'; f.fillRect(0, 0, size, size)
  g.filter = 'grayscale(1) brightness(.65)'; g.drawImage(normal, 0, 0)
  return { normal, flash, gray }
}
function sheet(name: string, sources: HTMLCanvasElement[], boss: boolean): Sheet {
  const size = boss ? 60 : 48, height = boss ? 52 : (partyArt as readonly string[]).includes(name) ? 40 : 32
  const frames = sources.map((source) => frame(source, size, height))
  return { name, width: size, height: size, anchor: [size / 2, size], top: size - height,
    portrait: sources[0], anims: {
      idle: { fps: 2, loop: true, frames: [frames[0]] },
      walk: { fps: 6, loop: true, frames: sources.length > 1 ? [frames[1], frames[0], frames[3], frames[0]] : frames },
      attack: { fps: 6, loop: false, frames: [frames[0], frames[2] ?? frames[0], frames[0]] },
    } }
}

export async function loadArtSheets(): Promise<Sheet[]> {
  const [party, enemy] = await Promise.all([load(partyUrl), load(enemyUrl)])
  // Reviewed cell boundaries: generated atlases have uneven gutters, so equal-grid slicing would cut hair and weapons.
  const px = [0, 310, 580, 870, 1140, 1402], py = [0, 309, 595, 842, 1122]
  const heroes = partyArt.map((id, col) => sheet(id, [0, 1, 2, 3].map((row) => crop(party,
    px[col] / 1402 * party.width, py[row] / 1122 * party.height,
    px[col + 1] / 1402 * party.width, py[row + 1] / 1122 * party.height)), false))
  const ex = [0, .24, .48, .675, 1], ey = [0, 1 / 3, 2 / 3, 1]
  const monsters = enemyArt.map((id, i) => {
    const col = i % 4, row = Math.floor(i / 4)
    return sheet(id, [crop(enemy, ex[col] * enemy.width, ey[row] * enemy.height,
      ex[col + 1] * enemy.width, ey[row + 1] * enemy.height)], col === 3)
  })
  return [...heroes, ...monsters]
}
