/**
 * Hides the strip while a full-screen app is in front (06-release.md §1).
 *
 * Windows only. The check is `SHQueryUserNotificationState` plus the foreground window's
 * rectangle; the rectangle is what actually decides, because QUNS_BUSY is also reported for a
 * locked machine or a screen saver. koffi is loaded lazily, and the feature turns itself off
 * (logged once) when it cannot be loaded.
 */
import { createRequire } from 'node:module'
const require = createRequire(__filename)
export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Sample { state: number; className: string; rect: Rect | null; windowId?: string }

export const QUNS = { notPresent: 1, busy: 2, d3dFullScreen: 3, presentation: 4, acceptsNotifications: 5, quietTime: 6, app: 7 } as const
/** States that mean "full screen" on their own, even when the window rectangle says nothing. */
const ALWAYS_HIDE: number[] = [QUNS.d3dFullScreen, QUNS.presentation]
/** Desktop, taskbar and the notification overflow are "in front" all the time; they never hide the strip. */
const SHELL_CLASSES = ['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland']
const TOLERANCE = 2
const POLL_MS = 2000

export function covers(rect: Rect, display: Rect, tolerance = TOLERANCE) {
  return rect.left <= display.left + tolerance && rect.top <= display.top + tolerance
    && rect.right >= display.right - tolerance && rect.bottom >= display.bottom - tolerance
}
/** Pure decision, so it can be tested without Windows. `display` is in physical pixels. */
export function shouldHideStrip(sample: Sample, display: Rect): boolean {
  if (SHELL_CLASSES.includes(sample.className)) return false
  if (ALWAYS_HIDE.includes(sample.state)) return true
  if (!sample.rect) return false
  return covers(sample.rect, display)
}

export type Probe = () => Sample
/** Builds the Windows probe, or returns null when the platform or koffi is not available. */
export function createProbe(log: (message: string) => void): Probe | null {
  if (process.platform !== 'win32') return null
  try {
    const koffi = require('koffi') as typeof import('koffi')
    const shell32 = koffi.load('shell32.dll')
    const user32 = koffi.load('user32.dll')
    const RECT = koffi.struct({ left: 'long', top: 'long', right: 'long', bottom: 'long' })
    const queryState = shell32.func('__stdcall', 'SHQueryUserNotificationState', 'int', ['_Out_ int *'])
    const foregroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'void *', [])
    const windowRect = user32.func('__stdcall', 'GetWindowRect', 'bool', ['void *', koffi.out(koffi.pointer(RECT))])
    const className = user32.func('__stdcall', 'GetClassNameW', 'int', ['void *', koffi.out(koffi.pointer('uint16_t')), 'int'])
    const nameBuffer = new Uint16Array(256)
    return () => {
      const state = [0]
      const result = queryState(state)
      if (result < 0) throw new Error(`SHQueryUserNotificationState failed: ${result}`)
      const hwnd = foregroundWindow()
      if (!hwnd) return { state: state[0], className: '', rect: null }
      const rect: Partial<Rect> = {}
      const ok = windowRect(hwnd, rect)
      const length = className(hwnd, nameBuffer, nameBuffer.length)
      return { state: state[0], windowId: String(koffi.address(hwnd)),
        className: length > 0 ? Buffer.from(nameBuffer.buffer, 0, length * 2).toString('utf16le') : '',
        rect: ok ? rect as Rect : null }
    }
  } catch (error) {
    log(`fullscreen watch off (koffi unavailable): ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/** Polls every 2 seconds and reports only when the answer changes. */
export class FullscreenWatcher {
  private timer: ReturnType<typeof setInterval> | undefined
  hidden = false
  constructor(private readonly probe: Probe, private readonly displayRect: () => Rect,
    private readonly onChange: (hidden: boolean) => void, private readonly log: (message: string) => void = console.error,
    private readonly onFailure: (error: unknown) => void = console.error) {}

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), POLL_MS)
    this.poll()
  }
  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if (this.hidden) { this.hidden = false; this.onChange(false) }
  }
  private poll() {
    let hidden: boolean
    try { hidden = shouldHideStrip(this.probe(), this.displayRect()) } catch (error) {
      this.log(`fullscreen probe failed: ${error instanceof Error ? error.message : String(error)}`)
      this.stop()
      this.onFailure(error)
      return
    }
    if (hidden === this.hidden) return
    this.hidden = hidden
    this.onChange(hidden)
  }
}
