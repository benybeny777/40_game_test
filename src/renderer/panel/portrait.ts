import { frameAt, sheets } from '../strip/sprites/sheet'
import { h } from './dom'

/** The panel and bestiary share the same approved portrait rendering. */
export function spriteImage(defId: string, scale: number, silhouette = false) {
  const sheet = sheets[defId]
  if (!sheet) throw new Error(`Sprite sheet is not loaded: ${defId}`)
  const canvas = h('canvas', { class: 'sprite', width: sheet.width * scale, height: (sheet.height - sheet.top) * scale })
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const portrait = sheet.portrait
  if (portrait) {
    const ratio = Math.min(canvas.width / portrait.width, canvas.height / portrait.height)
    const width = Math.round(portrait.width * ratio), height = Math.round(portrait.height * ratio)
    ctx.drawImage(portrait, Math.floor((canvas.width - width) / 2), canvas.height - height, width, height)
  } else ctx.drawImage(frameAt(sheet, 'idle', 0).normal, 0, sheet.top, sheet.width, sheet.height - sheet.top, 0, 0, sheet.width * scale, (sheet.height - sheet.top) * scale)
  if (silhouette) { ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#2c3242'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  return canvas
}
