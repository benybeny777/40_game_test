import { afterEach, expect, it, vi } from 'vitest'
import type { ShellApi } from '../src/shared/api'
import { RuntimeFailure } from '../src/renderer/runtimeFailure'
class Element {
  inert = false; className = ''; textContent = ''; children: Element[] = []; onclick?: () => void
  setAttribute() {} focus() {} append(...elements: Element[]) { this.children.push(...elements) }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('stops scheduling frames on the first draw error and retains export/reload controls', async () => {
  const root = new Element(), body = new Element(), frames: FrameRequestCallback[] = []
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', { body, querySelector: () => root, createElement: () => new Element() })
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frames.push(callback); return frames.length }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const api = { onState: vi.fn(), getState: async () => ({}), reportRuntimeError: vi.fn(async () => {}), exportSave: vi.fn(), reloadAfterRuntimeError: vi.fn() } as unknown as ShellApi
  const boundary = new RuntimeFailure(api), draw = vi.fn(() => { throw new Error('canvas draw exploded') })
  boundary.animate(draw); frames[0](100)
  expect(frames).toHaveLength(1); expect(boundary.stopped).toBe(true); expect(root.inert).toBe(true)
  expect(api.reportRuntimeError).toHaveBeenCalledOnce()
  boundary.run(draw); boundary.fail(new Error('secondary'))
  expect(draw).toHaveBeenCalledOnce(); expect(api.reportRuntimeError).toHaveBeenCalledOnce()
  const notice = body.children[0]
  expect(notice.children[2].textContent).toContain('canvas draw exploded')
  notice.children[3].onclick!(); notice.children[4].onclick!()
  expect(api.exportSave).toHaveBeenCalledOnce(); expect(api.reloadAfterRuntimeError).toHaveBeenCalledOnce()
  await Promise.resolve()
})
