/** One material-backed five-frame stride; feet and scenery share the faster travel clock. */
export const gaitTiming = { frames: 5, strideDots: 40, dotsPerSecond: 100, fps: 12.5 } as const

/** Render-only offsets: frame selection and foot placement share the same travelled-ground clock. */
export function walkPose(id: string, slot: number, groundDots: number) {
  const identity = [...id].reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) % 997, 0) / 997
  const cycles = Math.max(0, groundDots) / gaitTiming.strideDots + identity + slot * .27
  const phase = cycles - Math.floor(cycles), frame = Math.floor(phase * gaitTiming.frames)
  const wave = Math.sin(phase * Math.PI * 2)
  let dx = 0, dy = frame === 1 || frame === 4 ? -1 : 0
  if (id === 'jiangshi') dy = -Math.round(Math.sin(Math.PI * phase) ** 2 * 5)
  else if (id === 'rikishi') { dx = Math.round(wave); dy = 0 }
  else if (id === 'farmer' || id === 'vagabond') { dx = Math.round(wave * .6); dy = 0 }
  else if (id === 'maid' || id === 'ninja') dy *= 2
  return { frame, phase, elapsedMs: phase * gaitTiming.frames / gaitTiming.fps * 1000, dx: dx || 0, dy: dy || 0,
    shadowWidth: id === 'jiangshi' ? 12 - Math.abs(dy) : id === 'rikishi' ? 18 : 12 }
}
