import { loadArtPortraits, type ArtPortrait } from '../strip/sprites/sourceArt'
import { h } from './dom'

let portraits: ReadonlyMap<string, ArtPortrait> | undefined
export const portraitsReady = loadArtPortraits().then(loaded => { portraits = loaded })
/** Portraits share approved source crops, without loading battle animation or backgrounds. */
export function spriteImage(defId: string, scale: number, silhouette = false) {
  const portrait = portraits?.get(defId)
  if (!portrait) throw new Error('Portrait is not loaded: ' + defId)
  const canvas = h('canvas', { class: 'sprite', width: portrait.width * scale, height: (portrait.height - portrait.top) * scale })
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const source = portrait.source
  const ratio = Math.min(canvas.width / source.width, canvas.height / source.height)
  const width = Math.round(source.width * ratio), height = Math.round(source.height * ratio)
  ctx.drawImage(source, Math.floor((canvas.width - width) / 2), canvas.height - height, width, height)
  if (silhouette) { ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#2c3242'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  return canvas
}
