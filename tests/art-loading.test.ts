import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const decoded: string[] = []
class FakeCanvas {
  width = 0; height = 0
  getContext() {
    return { drawImage() {}, putImageData() {}, fillRect() {},
      getImageData: () => {
        const data = new Uint8ClampedArray(this.width * this.height * 4)
        // One opaque source pixel gives a deterministic nonempty crop without image/browser IO.
        data[3] = 255
        return { data }
      } }
  }
}
beforeEach(() => {
  vi.resetModules(); decoded.length = 0
  vi.stubGlobal('document', { createElement: () => new FakeCanvas() })
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.stubGlobal('Image', class {
    src = ''; width = 100; height = 100
    async decode() { decoded.push(this.src) }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('separate portrait loading', () => {
  it('loads only six portrait sources, with original render dimensions for all 29 identities', async () => {
    const { loadArtPortraits } = await import('../src/renderer/strip/sprites/sourceArt')
    const portraits = await loadArtPortraits()
    expect(portraits.size).toBe(29)
    expect(decoded).toHaveLength(6)
    expect(decoded.some(url => /walk|attack|background/.test(url))).toBe(false)
    expect(portraits.get('samurai')).toMatchObject({ width: 48, height: 48, top: 8 })
    expect(portraits.get('chochin')).toMatchObject({ width: 48, height: 48, top: 16 })
    expect(portraits.get('ooni')).toMatchObject({ width: 60, height: 60, top: 8 })
    expect(await loadArtPortraits()).toBe(portraits)
    expect(decoded).toHaveLength(6)
  })
  it('shares source decode and the portrait canvases with a mobile Scene in the same realm', async () => {
    const { loadArtPortraits } = await import('../src/renderer/strip/sprites/sourceArt')
    const { loadArtSheets } = await import('../src/renderer/strip/sprites/art')
    const [portraits, sheets] = await Promise.all([loadArtPortraits(), loadArtSheets()])
    expect(decoded).toHaveLength(10)
    expect(new Set(decoded).size).toBe(10)
    for (const sheet of sheets) expect(sheet.portrait).toBe(portraits.get(sheet.name)!.source)
  })
  it('preserves decode failure instead of substituting empty portraits', async () => {
    vi.stubGlobal('Image', class { src = ''; decode() { return Promise.reject(new Error('broken image')) } })
    const { loadArtPortraits } = await import('../src/renderer/strip/sprites/sourceArt')
    await expect(loadArtPortraits()).rejects.toThrow('broken image')
  })
})
