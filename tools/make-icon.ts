// Compile the current production samurai sprite into Windows icon sizes; source pixels remain unchanged.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decodePng, encodeIco, encodePng } from './png.ts'

const root = resolve(import.meta.dirname, '..')
const source = decodePng(readFileSync(join(root, 'assets/sprites/art/party-atlas.png')))
const cellWidth = Math.floor(source.width / 5), cellHeight = Math.floor(source.height / 4)
let left = cellWidth, top = cellHeight, right = 0, bottom = 0
for (let y = 0; y < cellHeight; y++) for (let x = 0; x < cellWidth; x++) {
  if (source.rgba[(y * source.width + x) * 4 + 3] < 64) continue
  left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
}
if (left > right || top > bottom) throw new Error('The samurai source cell is empty')
const width = right - left + 1, height = bottom - top + 1
function render(size: number) {
  const pixels = Buffer.alloc(size * size * 4), border = Math.max(1, Math.round(size / 32))
  const scale = Math.min((size - border * 4) / width, (size - border * 4) / height)
  const targetW = Math.max(1, Math.round(width * scale)), targetH = Math.max(1, Math.round(height * scale))
  const dx = Math.floor((size - targetW) / 2), dy = Math.floor((size - targetH) / 2)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = x < border || y < border || x >= size - border || y >= size - border
    pixels.set(edge ? [217, 165, 44, 255] : [21, 24, 36, 255], (y * size + x) * 4)
  }
  for (let y = 0; y < targetH; y++) for (let x = 0; x < targetW; x++) {
    const sx = left + Math.min(width - 1, Math.floor(x / targetW * width)), sy = top + Math.min(height - 1, Math.floor(y / targetH * height))
    const si = (sy * source.width + sx) * 4, di = ((dy + y) * size + dx + x) * 4, alpha = source.rgba[si + 3] / 255
    for (let channel = 0; channel < 3; channel++) pixels[di + channel] = Math.round(source.rgba[si + channel] * alpha + pixels[di + channel] * (1 - alpha))
  }
  return encodePng(size, size, pixels)
}
const out = join(root, 'build')
mkdirSync(out, { recursive: true })
const images = [256, 64, 32, 16].map((size) => ({ size, png: render(size) }))
writeFileSync(join(out, 'icon.png'), images[0].png)
writeFileSync(join(out, 'icon.ico'), encodeIco(images))
console.log(`icon → ${join(out, 'icon.ico')}`)
