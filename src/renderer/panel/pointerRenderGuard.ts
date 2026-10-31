/** Preserve the clicked DOM through pointerup, mouseup and click, including async view updates. */
export function pointerRenderGuard(target: EventTarget, render: () => void) {
  const pointers = new Set<number>()
  let blocked = false
  let releaseTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRelease = () => {
    if (releaseTimer !== undefined) clearTimeout(releaseTimer)
    releaseTimer = setTimeout(() => {
      releaseTimer = undefined
      if (pointers.size) return
      blocked = false
      render()
    }, 0)
  }
  const down = (event: Event) => {
    pointers.add((event as PointerEvent).pointerId)
    blocked = true
  }
  const up = (event: Event) => {
    pointers.delete((event as PointerEvent).pointerId)
    // Do not release here: native click follows pointerup/mouseup, and must see the same node.
    scheduleRelease()
  }
  // A mouse released outside the window may return without delivering pointerup.
  // Use the real button state on re-entry; never unlock a pointer that is still held.
  const move = (event: Event) => {
    const pointer = event as PointerEvent
    if (pointer.buttons === 0 && pointers.has(pointer.pointerId)) up(event)
  }
  const blur = () => { pointers.clear(); scheduleRelease() }
  target.addEventListener('pointerdown', down, true)
  target.addEventListener('pointerup', up, true)
  target.addEventListener('pointercancel', up, true)
  target.addEventListener('lostpointercapture', up, true)
  target.addEventListener('pointermove', move, true)
  target.addEventListener('blur', blur)
  return {
    get blocked() { return blocked },
    dispose() {
      if (releaseTimer !== undefined) clearTimeout(releaseTimer)
      target.removeEventListener('pointerdown', down, true)
      target.removeEventListener('pointerup', up, true)
      target.removeEventListener('pointercancel', up, true)
      target.removeEventListener('lostpointercapture', up, true)
      target.removeEventListener('pointermove', move, true)
      target.removeEventListener('blur', blur)
      pointers.clear(); blocked = false
    },
  }
}
