import partyUrl from '../../../../assets/sprites/art/party-atlas.png'
import extraAUrl from '../../../../assets/sprites/art/party-extra-a.png'
import extraBUrl from '../../../../assets/sprites/art/party-extra-b.png'
import tonoUrl from '../../../../assets/sprites/art/tono.png'
import garibenUrl from '../../../../assets/sprites/art/gariben.png'
import enemyUrl from '../../../../assets/sprites/art/enemy-atlas.png'
import enemyAttackUrl from '../../../../assets/sprites/art/enemy-attack.png'
import walkAUrl from '../../../../assets/sprites/art/party-walk-a.png'
import walkBUrl from '../../../../assets/sprites/art/party-walk-b.png'
import walkCUrl from '../../../../assets/sprites/art/party-walk-c.png'
import { enemyArt, partyArt, partyArtGroups } from '../../../shared/art'
import type { Frame, Sheet } from './sheet'
import { actionTiming } from '../actionPresentation'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return c
}
async function load(url: string) {
  const image = new Image(); image.src = url; await image.decode(); return image
}
/** Crop atlas cells to their alpha bounds; retain original pixels for the panel portraits. */
function crop(image: HTMLImageElement, left: number, top: number, right: number, bottom: number, isolate: boolean | 'cell' = false) {
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
function frame(source: HTMLCanvasElement, size: number, height: number, attackKey = false, fixedScale?: number): Frame {
  let anchorX = source.width / 2
  if (attackKey) {
    const pixels = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data
    let sum = 0, count = 0
    for (let y = Math.floor(source.height * .85); y < source.height; y++) for (let x = 0; x < source.width; x++) if (pixels[(y * source.width + x) * 4 + 3] >= 64) { sum += x; count++ }
    if (count) anchorX = sum / count
  }
  const scale = fixedScale ?? (attackKey ? height / source.height : Math.min(height / source.height, (size - 2) / source.width))
  // Wide swings keep their body scale and stay anchored at the feet instead of shrinking the whole enemy.
  const width = attackKey ? Math.max(size, 2 * Math.ceil(Math.max(anchorX, source.width - anchorX) * scale) + 2) : size
  const normal = canvas(width, size), ctx = normal.getContext('2d')!
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, attackKey ? Math.round(width / 2 - anchorX * scale) : Math.floor((size - w) / 2), size - h, w, h)
  const flash = canvas(width, size), gray = canvas(width, size)
  const f = flash.getContext('2d')!, g = gray.getContext('2d')!
  f.drawImage(normal, 0, 0); f.globalCompositeOperation = 'source-atop'; f.fillStyle = '#fff'; f.fillRect(0, 0, width, size)
  g.filter = 'grayscale(1) brightness(.65)'; g.drawImage(normal, 0, 0)
  return { normal, flash, gray }
}
function sheet(name: string, sources: HTMLCanvasElement[], boss: boolean, walkSources?: HTMLCanvasElement[]): Sheet {
  const size = boss ? 60 : 48, height = boss ? 52 : (partyArt as readonly string[]).includes(name) ? 40 : 32
  const hero = (partyArt as readonly string[]).includes(name)
  const frames = sources.map((source, index) => frame(source, size, height, !hero && index === 2))
  // All five poses retain a shared body scale; a bent knee must lower the head instead of stretching the body.
  const walkScale = walkSources ? Math.min(height / Math.max(...walkSources.map(source => source.height)), (size - 2) / Math.max(...walkSources.map(source => source.width))) : undefined
  const walkFrames = walkSources?.map(source => frame(source, size, height, false, walkScale))
  return { name, width: size, height: size, anchor: [size / 2, size], top: size - height,
    portrait: sources[0], anims: {
      idle: { fps: 2, loop: true, frames: [frames[0]] },
      walk: { fps: actionTiming.walkFps, loop: true, frames: walkFrames ?? (sources.length > 1 ? [frames[1], frames[3]] : frames) },
      attack: { fps: actionTiming.attackFps, loop: false, frames: [frames[2] ?? frames[0], frames[2] ?? frames[0], frames[0]] },
    } }
}

export async function loadArtSheets(): Promise<Sheet[]> {
  const images = await Promise.all([partyUrl, extraAUrl, extraBUrl, tonoUrl, garibenUrl, enemyUrl, enemyAttackUrl, walkAUrl, walkBUrl, walkCUrl].map(load))
  const enemy = images[5], enemyAttack = images[6]
  const walkGroups = [partyArtGroups[0], partyArtGroups[1], [...partyArtGroups[2], ...partyArtGroups[3], ...partyArtGroups[4]]]
  // Actual outputs contain five rows. Individual bounds retain hats/feet when neighbouring rows overlap.
  // The cell-only component pass removes neighbouring fragments without expanding into another full pose.
  const walkRegions: Array<Array<{ x: [number, number]; y: Array<[number, number]> }>> = [
    [
      { x: [36, 249], y: [[16, 240], [242, 464], [463, 683], [682, 903], [901, 1117]] },
      { x: [316, 505], y: [[11, 240], [240, 465], [465, 685], [685, 905], [905, 1112]] },
      { x: [603, 811], y: [[18, 240], [245, 464], [471, 684], [687, 905], [905, 1117]] },
      { x: [890, 1056], y: [[13, 240], [245, 463], [466, 684], [687, 905], [905, 1117]] },
      { x: [1171, 1350], y: [[14, 240], [246, 464], [466, 685], [685, 905], [905, 1117]] },
    ], [
      { x: [33, 252], y: [[28, 247], [256, 467], [468, 681], [686, 895], [900, 1108]] },
      { x: [310, 500], y: [[20, 251], [249, 467], [468, 681], [680, 895], [893, 1108]] },
      { x: [576, 787], y: [[20, 251], [255, 475], [475, 689], [687, 899], [899, 1111]] },
      { x: [850, 1111], y: [[31, 251], [256, 472], [477, 685], [692, 899], [902, 1110]] },
      { x: [1176, 1369], y: [[32, 251], [250, 472], [461, 682], [690, 899], [886, 1111]] },
    ], [
      { x: [14, 178], y: [[37, 235], [248, 444], [458, 662], [673, 875], [903, 1106]] },
      { x: [205, 380], y: [[32, 227], [228, 424], [430, 629], [646, 845], [870, 1081]] },
      { x: [386, 573], y: [[51, 236], [252, 445], [461, 660], [681, 879], [906, 1106]] },
      { x: [596, 777], y: [[35, 235], [244, 446], [458, 660], [668, 879], [891, 1106]] },
      { x: [770, 936], y: [[42, 235], [249, 447], [458, 659], [673, 879], [899, 1106]] },
      { x: [957, 1168], y: [[5, 237], [232, 453], [451, 665], [671, 885], [891, 1113]] },
      { x: [1177, 1333], y: [[39, 236], [244, 448], [457, 662], [679, 881], [898, 1110]] },
    ],
  ]
  const walks = new Map(walkGroups.flatMap((ids, group) => ids.map((id, col) => {
    const image = images[7 + group], region = walkRegions[group][col]
    return [id, region.y.map(([top, bottom]) => crop(image, region.x[0], top, region.x[1], bottom, 'cell'))] as const
  })))
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
    }), false, walks.get(id)))
  })
  // Reviewed transparent gutters in the selected 1448x1086 source atlas, including the bosses' full silhouettes.
  const enemyColumns = [[0, 330, 715, 1010, 1448], [0, 330, 745, 1000, 1448], [0, 360, 695, 985, 1448]]
  const ey = [0, 375 / 1086, 720 / 1086, 1]
  const attackBounds = [[13,86,338,349],[338,129,723,350],[713,125,1016,333],[1023,87,1439,349],
    [25,405,352,705],[326,452,760,699],[775,520,1057,697],[1059,401,1443,697],
    [10,741,378,1043],[382,764,714,1048],[730,812,1027,1056],[1023,720,1446,1060]]
  const monsters = enemyArt.map((id, i) => {
    const col = i % 4, row = Math.floor(i / 4)
    const ex = enemyColumns[row]
    const idle = crop(enemy, ex[col] / 1448 * enemy.width, ey[row] * enemy.height,
      ex[col + 1] / 1448 * enemy.width, ey[row + 1] * enemy.height)
    const [left, top, right, bottom] = attackBounds[i]
    const attack = crop(enemyAttack, left / 1448 * enemyAttack.width, top / 1086 * enemyAttack.height,
      right / 1448 * enemyAttack.width, bottom / 1086 * enemyAttack.height, true)
    return sheet(id, [idle, idle, attack, idle], col === 3)
  })
  return [...heroes, ...monsters]
}
