import { afterEach, expect, it, vi } from 'vitest'
import { pointerRenderGuard } from '../src/renderer/panel/pointerRenderGuard'

afterEach(() => vi.useRealTimers())
const pointer = (type: string, pointerId = 1) => Object.assign(new Event(type), { pointerId })

it('retains the clicked node across a view update between pointerup and click, then renders the clicked tab', () => {
  vi.useFakeTimers()
  const target = new EventTarget()
  let tab = 'store', displayed = 'store', node = 0
  const render = () => { if (!guard.blocked) { displayed = tab; node++ } }
  const guard = pointerRenderGuard(target, render)
  target.dispatchEvent(pointer('pointerdown'))
  const pressedNode = node
  target.dispatchEvent(pointer('pointerup'))
  render() // async onView / store refresh before native click
  expect(node).toBe(pressedNode)
  // A click is delivered only if the original target still exists.
  if (node === pressedNode) { tab = 'help'; render() }
  expect(displayed).toBe('store')
  vi.runAllTimers()
  expect(displayed).toBe('help')
  expect(node).toBe(pressedNode + 1)
  guard.dispose()
})

it.each(['pointercancel', 'lostpointercapture', 'blur'])('releases after %s and does not block later keyboard activation', type => {
  vi.useFakeTimers()
  const target = new EventTarget(), render = vi.fn()
  const guard = pointerRenderGuard(target, render)
  target.dispatchEvent(pointer('pointerdown'))
  target.dispatchEvent(pointer(type))
  vi.runAllTimers()
  expect(guard.blocked).toBe(false)
  expect(render).toHaveBeenCalledOnce()
  target.dispatchEvent(new Event('click')) // keyboard activation has no pointer sequence
  expect(guard.blocked).toBe(false)
  guard.dispose()
})

it('recovers a missed outside release when that pointer returns without buttons', () => {
  vi.useFakeTimers()
  const target = new EventTarget(), render = vi.fn()
  const guard = pointerRenderGuard(target, render)
  target.dispatchEvent(pointer('pointerdown', 1))
  target.dispatchEvent(Object.assign(pointer('pointermove', 1), { buttons: 1 }))
  vi.runAllTimers()
  expect(guard.blocked).toBe(true)
  target.dispatchEvent(Object.assign(pointer('pointermove', 2), { buttons: 0 }))
  vi.runAllTimers()
  expect(guard.blocked).toBe(true)
  target.dispatchEvent(Object.assign(pointer('pointermove', 1), { buttons: 0 }))
  expect(guard.blocked).toBe(true) // preserve any current input event sequence
  vi.runAllTimers()
  expect(guard.blocked).toBe(false)
  expect(render).toHaveBeenCalledOnce()
  guard.dispose()
})

it('does not release while another pointer is still held or a new press starts before the timer', () => {
  vi.useFakeTimers()
  const target = new EventTarget(), render = vi.fn()
  const guard = pointerRenderGuard(target, render)
  target.dispatchEvent(pointer('pointerdown', 1))
  target.dispatchEvent(pointer('pointerdown', 2))
  target.dispatchEvent(pointer('pointerup', 1))
  vi.runAllTimers()
  expect(guard.blocked).toBe(true)
  expect(render).not.toHaveBeenCalled()
  target.dispatchEvent(pointer('pointerup', 2))
  target.dispatchEvent(pointer('pointerdown', 3))
  vi.runAllTimers()
  expect(guard.blocked).toBe(true)
  target.dispatchEvent(pointer('pointerup', 3))
  vi.runAllTimers()
  expect(guard.blocked).toBe(false)
  expect(render).toHaveBeenCalledOnce()
  guard.dispose()
})
