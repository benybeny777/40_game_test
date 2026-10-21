/**
 * Text sprite format (02-strip.md §6.1). One character = one dot, '.' = transparent.
 *
 *   name: samurai
 *   size: 24x24
 *   anchor: 12,23            # feet centre
 *   anim idle fps=2 loop
 *   frame                    # rows follow; short rows are padded right, missing rows are padded at the top
 *   frame from idle#0        # copy a previous frame, then "NN: row" lines override single rows
 *   20: ....ajjjjja..ajjjjja
 *
 * All sprites face right; enemies are mirrored at draw time.
 */
export interface ParsedAnim { fps: number; loop: boolean; frames: string[][] }
export interface ParsedSprite { name: string; width: number; height: number; anchor: [number, number]; anims: Record<string, ParsedAnim> }
export type Palette = Record<string, string>

export function parsePalette(text: string): Palette {
  const palette: Palette = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-z0-9])\s+(#[0-9a-fA-F]{6})/.exec(line.trim())
    if (match) palette[match[1]] = match[2]
  }
  return palette
}

export function parseSprite(text: string, palette: Palette): ParsedSprite {
  const fail = (line: number, message: string): never => { throw new Error(`sprite line ${line + 1}: ${message}`) }
  let name = '', width = 0, height = 0, anchor: [number, number] | undefined
  const anims: Record<string, ParsedAnim> = {}
  let anim: ParsedAnim | undefined
  let rows: string[] | undefined
  let overrides: Map<number, string> | undefined
  let base: string[] | undefined
  const finish = () => {
    if (!anim || !rows) return
    let frame: string[]
    if (base) {
      frame = [...base]
      for (const [index, row] of overrides!) frame[index] = row.padEnd(width, '.')
    } else {
      if (rows.length > height) fail(0, `frame has ${rows.length} rows, max ${height}`)
      frame = [...Array.from({ length: height - rows.length }, () => '.'.repeat(width)), ...rows.map((row) => row.padEnd(width, '.'))]
    }
    anim.frames.push(frame)
    rows = undefined; overrides = undefined; base = undefined
  }
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trimEnd()
    if (!line.trim() || line.trimStart().startsWith('#')) return
    let match: RegExpExecArray | null
    if ((match = /^name:\s*(\S+)/.exec(line))) { name = match[1]; return }
    if ((match = /^size:\s*(\d+)x(\d+)/.exec(line))) { width = Number(match[1]); height = Number(match[2]); return }
    if ((match = /^anchor:\s*(\d+),(\d+)/.exec(line))) { anchor = [Number(match[1]), Number(match[2])]; return }
    if ((match = /^anim\s+(\w+)(?:\s+fps=(\d+))?(?:\s+(loop|once))?/.exec(line))) {
      finish()
      anim = { fps: Number(match[2] ?? 8), loop: match[3] !== 'once', frames: [] }
      anims[match[1]] = anim
      return
    }
    if ((match = /^frame(?:\s+from\s+(\w+)#(\d+))?\s*$/.exec(line))) {
      finish()
      if (!anim) fail(index, 'frame before anim')
      if (!width || !height) fail(index, 'size must come before frames')
      rows = []
      if (match[1]) {
        const source = anims[match[1]]?.frames[Number(match[2])]
        if (!source) fail(index, `unknown frame ${match[1]}#${match[2]}`)
        base = source; overrides = new Map()
      }
      return
    }
    if (!rows) fail(index, `unexpected line "${line}"`)
    let row = line.trim(), target: number | undefined
    if (base && (match = /^(\d+):\s?(.*)$/.exec(row))) { target = Number(match[1]); row = match[2] }
    else if (base) fail(index, 'override rows must be "NN: row"')
    if (row.length > width) fail(index, `row is ${row.length} wide, max ${width}`)
    for (const char of row) if (char !== '.' && !(char in palette)) fail(index, `unknown palette char "${char}"`)
    if (target !== undefined) { if (target >= height) fail(index, `row ${target} out of range`); overrides!.set(target, row) }
    else rows!.push(row)
  })
  finish()
  if (!name) throw new Error('sprite has no name')
  if (!anchor) throw new Error(`${name}: anchor missing`)
  if (anchor[0] >= width || anchor[1] >= height) throw new Error(`${name}: anchor outside the frame`)
  if (!Object.keys(anims).length) throw new Error(`${name}: no anims`)
  return { name, width, height, anchor, anims }
}
