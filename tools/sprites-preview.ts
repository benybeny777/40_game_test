// pnpm sprites:preview — renders every text sprite at 4× into .dev-data/preview/sprites.png for visual review.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { parsePalette, parseSprite } from '../src/renderer/strip/sprites/parse.ts'

const root = resolve(import.meta.dirname, '..')
const palette = parsePalette(readFileSync(join(root, 'assets/palettes/base32.txt'), 'utf8'))
const dir = join(root, 'assets/sprites/src')
const sprites = readdirSync(dir).filter((file) => file.endsWith('.sprite.txt')).sort().map((file) => parseSprite(readFileSync(join(dir, file), 'utf8'), palette))
const scale = 4, gap = 4
const rows = sprites.map((sprite) => Object.values(sprite.anims).flatMap((anim) => anim.frames).map((frame) => ({ sprite, frame })))
const width = Math.max(...rows.map((row) => row.reduce((sum, { sprite }) => sum + (sprite.width + gap) * scale, gap * scale)))
const height = rows.reduce((sum, row) => sum + (row[0].sprite.height + gap) * scale, gap * scale)
const pixels = Buffer.alloc(width * height * 4)
for (let i = 0; i < width * height; i++) pixels.set([58, 66, 84, 255], i * 4)   // mid-grey: shows both outlines and dark colours
let top = gap * scale
for (const row of rows) {
  let left = gap * scale
  for (const { sprite, frame } of row) {
    frame.forEach((line, y) => [...line].forEach((char, x) => {
      if (char === '.') return
      const hex = palette[char], rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pixels.set([...rgb, 255], ((top + y * scale + dy) * width + left + x * scale + dx) * 4)
    }))
    left += (sprite.width + gap) * scale
  }
  top += (row[0].sprite.height + gap) * scale
}
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8)
const raw = Buffer.alloc((width * 4 + 1) * height)
for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
const out = join(root, '.dev-data/preview')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'sprites.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log(`${sprites.length} sprites → ${join(out, 'sprites.png')} (${width}×${height})`)
