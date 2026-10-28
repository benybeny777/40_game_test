import { afterEach, describe, expect, it, vi } from 'vitest'
import { covers, FullscreenWatcher, QUNS, shouldHideStrip, type Sample } from '../src/main/fullscreen.ts'

const display = { left: 0, top: 0, right: 2560, bottom: 1440 }
const sample = (over: Partial<Sample> = {}): Sample =>
  ({ state: QUNS.acceptsNotifications, className: 'Chrome_WidgetWin_1', rect: { left: 0, top: 0, right: 2560, bottom: 1392 }, ...over })

describe('全画面のアプリを使っている間は帯を隠す（M7 §1）', () => {
  it('最大化（タスクバーが見える）では隠さない', () => {
    expect(shouldHideStrip(sample(), display)).toBe(false)
  })
  it('モニター全体を覆う前面ウィンドウでは隠す', () => {
    expect(shouldHideStrip(sample({ rect: { left: 0, top: 0, right: 2560, bottom: 1440 } }), display)).toBe(true)
  })
  it('D3Dの全画面とプレゼンモードは、ウィンドウの大きさに関わらず隠す', () => {
    expect(shouldHideStrip(sample({ state: QUNS.d3dFullScreen, rect: null }), display)).toBe(true)
    expect(shouldHideStrip(sample({ state: QUNS.presentation, rect: null }), display)).toBe(true)
  })
  it('デスクトップとタスクバーは前面でも隠さない', () => {
    const full = { left: 0, top: 0, right: 2560, bottom: 1440 }
    for (const className of ['Progman', 'WorkerW', 'Shell_TrayWnd']) {
      expect(shouldHideStrip(sample({ className, rect: full }), display), className).toBe(false)
      expect(shouldHideStrip(sample({ className, rect: full, state: QUNS.d3dFullScreen }), display), className).toBe(false)
    }
  })
  it('画面ロックや待機中のQUNS_BUSYだけでは隠さない', () => {
    expect(shouldHideStrip(sample({ state: QUNS.busy, rect: null }), display)).toBe(false)
  })
  it('サブモニターの座標でも判定できる', () => {
    const second = { left: 2560, top: 0, right: 4480, bottom: 1080 }
    expect(covers({ left: 2560, top: 0, right: 4480, bottom: 1080 }, second)).toBe(true)
    expect(covers({ left: 0, top: 0, right: 2560, bottom: 1440 }, second)).toBe(false)
  })
})

describe('全画面監視の終了', () => {
  afterEach(() => vi.useRealTimers())
  it('開始は重複せず、停止すると隠れた帯を戻してポーリングも止まる', () => {
    vi.useFakeTimers()
    const probe = vi.fn(() => sample({ rect: display })), changed = vi.fn()
    const watcher = new FullscreenWatcher(probe, () => display, changed)
    watcher.start(); watcher.start()
    expect(probe).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenLastCalledWith(true)
    watcher.stop()
    expect(changed).toHaveBeenLastCalledWith(false)
    vi.advanceTimersByTime(10000)
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('ネイティブAPIが失敗したら監視を止め、帯を復帰する', () => {
    vi.useFakeTimers()
    const probe = vi.fn(() => sample({ rect: display })), changed = vi.fn(), log = vi.fn()
    const watcher = new FullscreenWatcher(probe, () => display, changed, log)
    watcher.start()
    probe.mockImplementation(() => { throw new Error('probe failure') })
    vi.advanceTimersByTime(2000)
    expect(watcher.hidden).toBe(false)
    expect(changed).toHaveBeenLastCalledWith(false)
    expect(log).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(10000)
    expect(probe).toHaveBeenCalledTimes(2)
  })
})
