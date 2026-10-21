import paletteText from '../../../../assets/palettes/base32.txt?raw'
import { parsePalette, parseSprite, type ParsedSprite } from './parse'

const sources = import.meta.glob('../../../../assets/sprites/src/*.sprite.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
export const palette = parsePalette(paletteText)

export interface Frame { normal: HTMLCanvasElement; flash: HTMLCanvasElement; gray: HTMLCanvasElement }
export interface Sheet { name: string; width: number; height: number; anchor: [number, number]; top: number
  anims: Record<string, { fps: number; loop: boolean; frames: Frame[] }> }

function canvas(width: number, height: number) {
  const element = document.createElement('canvas'); element.width = width; element.height = height
  return element
}
function render(sprite: ParsedSprite, rows: string[], mode: 'normal' | 'flash' | 'gray') {
  const element = canvas(sprite.width, sprite.height)
  const ctx = element.getContext('2d')!
  rows.forEach((row, y) => [...row].forEach((char, x) => {
    if (char === '.') return
    let color = palette[char]
    if (mode === 'flash') color = char === 'a' ? '#15131c' : '#ffffff'
    if (mode === 'gray') {
      const [r, g, b] = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
      const value = Math.round((r * 0.3 + g * 0.59 + b * 0.11) * 0.7)
      color = `rgb(${value},${value},${value + 12})`
    }
    ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1)
  }))
  return element
}
function build(sprite: ParsedSprite): Sheet {
  const first = Object.values(sprite.anims)[0].frames[0]
  const top = Math.max(0, first.findIndex((row) => /[^.]/.test(row)))
  return { name: sprite.name, width: sprite.width, height: sprite.height, anchor: sprite.anchor, top,
    anims: Object.fromEntries(Object.entries(sprite.anims).map(([name, anim]) => [name, { fps: anim.fps, loop: anim.loop,
      frames: anim.frames.map((rows) => ({ normal: render(sprite, rows, 'normal'), flash: render(sprite, rows, 'flash'), gray: render(sprite, rows, 'gray') })) }])) }
}
export const sheets: Record<string, Sheet> = Object.fromEntries(Object.values(sources).map((text) => {
  const sheet = build(parseSprite(text, palette))
  return [sheet.name, sheet]
}))
export function frameAt(sheet: Sheet, anim: string, elapsedMs: number): Frame {
  const entry = sheet.anims[anim] ?? sheet.anims.idle ?? Object.values(sheet.anims)[0]
  const index = Math.floor(Math.max(0, elapsedMs) / (1000 / entry.fps))
  return entry.frames[entry.loop ? index % entry.frames.length : Math.min(index, entry.frames.length - 1)]
}
export function animDuration(sheet: Sheet, anim: string) {
  const entry = sheet.anims[anim]
  return entry ? entry.frames.length * 1000 / entry.fps : 0
}
