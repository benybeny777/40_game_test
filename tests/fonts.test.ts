import { describe, expect, it, vi } from 'vitest'
import { loadUiFonts } from '../src/renderer/fonts'
describe('bundled UI fonts', () => {
  it('waits for real regular and bold faces', async () => {
    const load = vi.fn().mockResolvedValue([{} as FontFace])
    await loadUiFonts({ load })
    expect(load.mock.calls.map(call => call[0])).toEqual(['400 16px "BIZ UDPGothic"', '700 16px "BIZ UDPGothic"'])
  })
  it('rejects absent CSS faces and file decode errors instead of accepting OS fallback', async () => {
    await expect(loadUiFonts({ load: vi.fn().mockResolvedValue([]) })).rejects.toThrow('Bundled UI font is missing')
    await expect(loadUiFonts({ load: vi.fn().mockRejectedValue(new Error('decode failed')) })).rejects.toThrow('decode failed')
  })
})
