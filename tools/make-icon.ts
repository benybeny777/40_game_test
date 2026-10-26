// pnpm icon — builds build/icon.ico (256/64/32/16) from the samurai sprite on a dark navy tile with a gold frame.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parsePalette, parseSprite } from '../src/renderer/strip/sprites/parse.ts'
import { encodeIco, encodePng } from './png.ts'

const root = resolve(import.meta.dirname, '..')
const palette = parsePalette(readFileSync(join(root, 'assets/palettes/base32.txt'), 'utf8'))
const sprite = parseSprite(readFileSync(join(root, 'assets/sprites/src/samurai.sprite.txt'), 'utf8'), palette)
const frame = sprite.anims.idle.frames[0]
const hex = (value: string) => [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
function render(size: number) {
  const pixels = Buffer.alloc(size * size * 4)
  const border = Math.max(1, Math.round(size / 32)), scale = Math.max(1, Math.floor((size - border * 4) / sprite.width))
  const left = Math.floor((size - sprite.width * scale) / 2), top = Math.floor((size - sprite.height * scale) / 2)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = x < border || y < border || x >= size - border || y >= size - border
    pixels.set(edge ? [217, 165, 44, 255] : [21, 24, 36, 255], (y * size + x) * 4)
  }
  frame.forEach((row, y) => [...row].forEach((char, x) => {
    if (char === '.') return
    const rgb = hex(palette[char])
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pixels.set([...rgb, 255], ((top + y * scale + dy) * size + left + x * scale + dx) * 4)
  }))
  return encodePng(size, size, pixels)
}
const out = join(root, 'build')
mkdirSync(out, { recursive: true })
const images = [256, 64, 32, 16].map((size) => ({ size, png: render(size) }))
writeFileSync(join(out, 'icon.png'), images[0].png)
writeFileSync(join(out, 'icon.ico'), encodeIco(images))
console.log(`icon → ${join(out, 'icon.ico')}`)
