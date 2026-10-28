import partyUrl from '../../../../assets/sprites/art/party-atlas.png'
import extraAUrl from '../../../../assets/sprites/art/party-extra-a.png'
import extraBUrl from '../../../../assets/sprites/art/party-extra-b.png'
import tonoUrl from '../../../../assets/sprites/art/tono.png'
import garibenUrl from '../../../../assets/sprites/art/gariben.png'
import enemyUrl from '../../../../assets/sprites/art/enemy-atlas.png'
import { enemyArt, partyArt, partyArtGroups } from '../../../shared/art'
import type { Frame, Sheet } from './sheet'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return c
}
async function load(url: string) {
  const image = new Image(); image.src = url; await image.decode(); return image
}
/** Crop atlas cells to their alpha bounds; retain original pixels for the panel portraits. */
function crop(image: HTMLImageElement, left: number, top: number, right: number, bottom: number, isolate = false) {
  const expectedX = (right - left) / 2, expectedY = (bottom - top) / 2
  const originalLeft = left, originalTop = top
  if (isolate) {
    const marginX = image.width * .055, marginY = image.height * .02
    left = Math.max(0, left - marginX); top = Math.max(0, top - marginY)
    right = Math.min(image.width, right + marginX); bottom = Math.min(image.height, bottom + marginY)
  }
  const cell = canvas(Math.round(right - left), Math.round(bottom - top)), ctx = cell.getContext('2d')!
  ctx.drawImage(image, Math.round(left), Math.round(top), cell.width, cell.height, 0, 0, cell.width, cell.height)
  const data = ctx.getImageData(0, 0, cell.width, cell.height).data
  if (isolate) {
    // Uneven generated gutters can contain a neighbour's weapon/feet. Keep this character's connected silhouette.
    const seen = new Uint8Array(cell.width * cell.height)
    let best: number[] = [], bestScore = 0
    const cx = expectedX + originalLeft - left, cy = expectedY + originalTop - top
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || data[start * 4 + 3] < 64) continue
      const component = [start]; seen[start] = 1
      let sumX = 0, sumY = 0
      for (let cursor = 0; cursor < component.length; cursor++) {
        const index = component[cursor], x = index % cell.width, y = Math.floor(index / cell.width)
        sumX += x; sumY += y
        for (const next of [x > 0 ? index - 1 : -1, x + 1 < cell.width ? index + 1 : -1, y > 0 ? index - cell.width : -1, y + 1 < cell.height ? index + cell.width : -1]) {
          if (next < 0 || seen[next] || data[next * 4 + 3] < 64) continue
          seen[next] = 1; component.push(next)
        }
      }
      const distance = Math.abs(sumX / component.length - cx) / Math.max(1, expectedX)
        + Math.abs(sumY / component.length - cy) / Math.max(1, expectedY)
      const score = component.length / (1 + distance ** 4)
      if (score > bestScore) { bestScore = score; best = component }
    }
    const keep = new Uint8Array(seen.length)
    for (const index of best) keep[index] = 1
    for (let index = 0; index < keep.length; index++) if (!keep[index]) data[index * 4 + 3] = 0
    ctx.putImageData(new ImageData(data, cell.width, cell.height), 0, 0)
  }
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
  const images = await Promise.all([partyUrl, extraAUrl, extraBUrl, tonoUrl, garibenUrl, enemyUrl].map(load))
  const enemy = images[images.length - 1]
  const heroes = partyArtGroups.flatMap((ids, group) => {
    const image = images[group], single = ids.length === 1
    const columns = single ? 2 : ids.length, rows = single ? 2 : 4
    const rowCuts = [[0, 298, 578, 846, 1122], [0, 312, 595, 846, 1122], [0, 321, 605, 878, 1122]][group]
    return ids.map((id, col) => sheet(id, [0, 1, 2, 3].map((index) => {
      const x = single ? index % 2 : col, y = single ? Math.floor(index / 2) : index
      const y0 = rowCuts ? rowCuts[y] / 1122 * image.height : y * image.height / rows
      const y1 = rowCuts ? rowCuts[y + 1] / 1122 * image.height : (y + 1) * image.height / rows
      return crop(image, x * image.width / columns, y0,
        (x + 1) * image.width / columns, y1, true)
    }), false))
  })
  // Reviewed transparent gutters in the selected 1448x1086 source atlas, including the bosses' full silhouettes.
  const enemyColumns = [[0, 330, 715, 1010, 1448], [0, 330, 745, 1000, 1448], [0, 360, 695, 985, 1448]]
  const ey = [0, 375 / 1086, 720 / 1086, 1]
  const monsters = enemyArt.map((id, i) => {
    const col = i % 4, row = Math.floor(i / 4)
    const ex = enemyColumns[row]
    return sheet(id, [crop(enemy, ex[col] / 1448 * enemy.width, ey[row] * enemy.height,
      ex[col + 1] / 1448 * enemy.width, ey[row + 1] * enemy.height)], col === 3)
  })
  return [...heroes, ...monsters]
}
