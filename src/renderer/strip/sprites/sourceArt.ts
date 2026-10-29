import partyUrl from '../../../../assets/sprites/art/party-atlas.png'
import extraAUrl from '../../../../assets/sprites/art/party-extra-a.png'
import extraBUrl from '../../../../assets/sprites/art/party-extra-b.png'
import tonoUrl from '../../../../assets/sprites/art/tono.png'
import garibenUrl from '../../../../assets/sprites/art/gariben.png'
import enemyUrl from '../../../../assets/sprites/art/enemy-atlas.png'
import { enemyArt, partyArtGroups } from '../../../shared/art'

export const portraitUrls = [partyUrl, extraAUrl, extraBUrl, tonoUrl, garibenUrl, enemyUrl]
// Share in-flight decoding across the mobile panel and Scene. Release source images after cropping.
const decoding = new Map<string, Promise<HTMLImageElement>>()
export function loadArtImage(url: string): Promise<HTMLImageElement> {
  const pending = decoding.get(url)
  if (pending) return pending
  const image = new Image(); image.src = url
  const ready = image.decode().then(() => image).finally(() => decoding.delete(url))
  decoding.set(url, ready)
  return ready
}
function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return c
}
/** Crop atlas cells to their alpha bounds; retain original pixels for the panel portraits. */
export function crop(image: HTMLImageElement, left: number, top: number, right: number, bottom: number, isolate: boolean | 'cell' = false) {
  const expectedX = (right - left) / 2, expectedY = (bottom - top) / 2
  const originalLeft = left, originalTop = top
  if (isolate === true) {
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

export function heroCrop(image: HTMLImageElement, group: number, col: number, index: number) {
  const ids = partyArtGroups[group], single = ids.length === 1
  const columns = single ? 2 : ids.length, rows = single ? 2 : 4
  const rowCuts = [[0, 298, 578, 846, 1122], [0, 312, 595, 846, 1122], [0, 321, 605, 878, 1122]][group]
  const x = single ? index % 2 : col, y = single ? Math.floor(index / 2) : index
  const y0 = rowCuts ? rowCuts[y] / 1122 * image.height : y * image.height / rows
  const y1 = rowCuts ? rowCuts[y + 1] / 1122 * image.height : (y + 1) * image.height / rows
  return crop(image, x * image.width / columns, y0, (x + 1) * image.width / columns, y1, true)
}
function enemyPortrait(image: HTMLImageElement, index: number) {
  const columns = [[0, 330, 715, 1010, 1448], [0, 330, 745, 1000, 1448], [0, 360, 695, 985, 1448]]
  const rows = [0, 375 / 1086, 720 / 1086, 1]
  const col = index % 4, row = Math.floor(index / 4), ex = columns[row]
  return crop(image, ex[col] / 1448 * image.width, rows[row] * image.height,
    ex[col + 1] / 1448 * image.width, rows[row + 1] * image.height)
}
export interface ArtPortrait { source: HTMLCanvasElement; width: number; height: number; top: number }
let portraitsReady: Promise<ReadonlyMap<string, ArtPortrait>> | undefined
export function loadArtPortraits(): Promise<ReadonlyMap<string, ArtPortrait>> {
  return portraitsReady ??= Promise.all(portraitUrls.map(loadArtImage)).then(images => {
    const portraits = new Map<string, ArtPortrait>()
    for (const [group, ids] of partyArtGroups.entries()) for (const [col, id] of ids.entries()) {
      portraits.set(id, { source: heroCrop(images[group], group, col, 0), width: 48, height: 48, top: 8 })
    }
    for (const [index, id] of enemyArt.entries()) {
      const boss = index % 4 === 3, size = boss ? 60 : 48
      portraits.set(id, { source: enemyPortrait(images[5], index), width: size, height: size, top: size - (boss ? 52 : 32) })
    }
    return portraits
  })
}
