// Original 3×5 bitmap glyphs for numbers and short labels drawn inside the pixel canvas.
const glyphs: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110', 'E': '111100110100111',
  'F': '111100110100100', 'G': '011100101101011', 'H': '101101111101101', 'I': '111010010010111', 'K': '101101110101101',
  'L': '100100100100111', 'M': '101111111101101', 'N': '110101101101101', 'O': '010101101101010', 'P': '110101110100100',
  'R': '110101110101101', 'S': '011100010001110', 'T': '111010010010010', 'U': '101101101101111', 'V': '101101101101010',
  'W': '101101111111101', 'X': '101101010101101', 'Y': '101101010010010', 'Z': '111001010100111',
  '/': '001001010100100', '-': '000000111000000', '+': '000010111010000', '!': '010010010000010', '.': '000000000000010',
  ':': '000010000010000', '%': '101001010100101', 'x': '000101010101000', ' ': '000000000000000', '?': '111001011000010',
}
export const GLYPH_W = 3, GLYPH_H = 5
export function textWidth(text: string) { return text.length ? text.length * (GLYPH_W + 1) - 1 : 0 }
/** Draws with a 1-dot dark outline so the text stays readable over any window behind the strip. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, outline = '#15131c') {
  const plot = (fill: string, ox: number, oy: number) => {
    ctx.fillStyle = fill
    let cx = Math.round(x)
    for (const char of text) {
      const bits = glyphs[char] ?? glyphs['?']
      for (let i = 0; i < bits.length; i++) if (bits[i] === '1') ctx.fillRect(cx + (i % GLYPH_W) + ox, Math.round(y) + Math.floor(i / GLYPH_W) + oy, 1, 1)
      cx += GLYPH_W + 1
    }
  }
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) plot(outline, ox, oy)
  plot(color, 0, 0)
}
