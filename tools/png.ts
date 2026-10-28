// Minimal RGBA PNG encoder (node:zlib only, no dependency). Shared by the sprite preview and the icon builder.
import { crc32, deflateSync, inflateSync } from 'node:zlib'

const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}
export function encodePng(width: number, height: number, rgba: Buffer) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
/** Source-asset decoder for 8-bit, non-interlaced RGB/RGBA PNGs. No native dependency or image service. */
export function decodePng(png: Buffer) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG signature')
  let width = 0, height = 0, channels = 0
  const data: Buffer[] = []
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset), end = offset + 12 + length
    if (end > png.length) throw new Error('Truncated PNG chunk')
    const type = png.toString('ascii', offset + 4, offset + 8), body = png.subarray(offset + 8, offset + 8 + length)
    if ((crc32(png.subarray(offset + 4, offset + 8 + length)) >>> 0) !== png.readUInt32BE(offset + 8 + length)) throw new Error('PNG checksum mismatch')
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4)
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0
      if (body[8] !== 8 || !channels || body[12] !== 0 || !width || !height || width * height > 16777216) throw new Error('Unsupported PNG format')
    } else if (type === 'IDAT') data.push(body)
    else if (type === 'IEND') break
    offset = end
  }
  if (!channels || !data.length) throw new Error('Missing PNG image data')
  const stride = width * channels, expected = (stride + 1) * height
  const raw = inflateSync(Buffer.concat(data), { maxOutputLength: expected })
  if (raw.length !== expected) throw new Error('Unexpected PNG image length')
  const decoded = Buffer.alloc(stride * height), rgba = Buffer.alloc(width * height * 4)
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c)
    return da <= db && da <= dc ? a : db <= dc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    if (filter > 4) throw new Error('Unsupported PNG filter')
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? decoded[y * stride + x - channels] : 0
      const up = y ? decoded[(y - 1) * stride + x] : 0
      const upperLeft = y && x >= channels ? decoded[(y - 1) * stride + x - channels] : 0
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0
      decoded[y * stride + x] = raw[y * (stride + 1) + 1 + x] + predictor
    }
    for (let x = 0; x < width; x++) {
      const src = y * stride + x * channels, dest = (y * width + x) * 4
      rgba.set([decoded[src], decoded[src + 1], decoded[src + 2], channels === 4 ? decoded[src + 3] : 255], dest)
    }
  }
  return { width, height, rgba }
}
/** A Vista+ .ico can embed PNG images directly. */
export function encodeIco(images: Array<{ size: number; png: Buffer }>) {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry); header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((image) => image.png)])
}
