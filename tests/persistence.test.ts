import { describe, expect, it, vi } from 'vitest'
import { PersistenceGuard } from '../src/main/persistence'

describe('保存失敗による進行保護', () => {
  it('失敗を通知し、正常に再保存するまでエラーを保持する', () => {
    const changed = vi.fn(), write = vi.fn().mockImplementationOnce(() => { throw new Error('disk full') })
    const guard = new PersistenceGuard<{ coins: number }>(write, changed)
    expect(guard.save({ coins: 100 })).toBe(false)
    expect(guard.error).toBe('disk full')
    expect(changed).toHaveBeenLastCalledWith('disk full')
    expect(guard.save({ coins: 100 })).toBe(true)
    expect(guard.error).toBeUndefined()
    expect(changed).toHaveBeenLastCalledWith()
    expect(write).toHaveBeenLastCalledWith({ coins: 100 })
  })
  it('正常な定期保存では状態イベントを増やさない', () => {
    const changed = vi.fn(), guard = new PersistenceGuard(vi.fn(), changed)
    expect(guard.save({})).toBe(true)
    expect(changed).not.toHaveBeenCalled()
  })
})

import { commitSettings, confirmSavedQuit, isProtectedExport, StoragePause } from '../src/main/persistence'
import { join } from 'node:path'

describe('保存通知と再試行の停止状態', () => {
  it('画面通知が失敗しても、成功した保存を失敗扱いにしない', () => {
    let failWrite = true
    const failed = vi.fn(), notificationError = new Error('renderer gone')
    const guard = new PersistenceGuard(() => { if (failWrite) throw new Error('disk full') }, () => { throw notificationError }, failed)
    expect(guard.save({})).toBe(false); expect(guard.error).toBe('disk full')
    expect(guard.notificationError).toBe(notificationError)
    expect(failed).toHaveBeenLastCalledWith(notificationError)
    failWrite = false
    expect(guard.save({})).toBe(true); expect(guard.error).toBeUndefined()
    expect(guard.notificationError).toBe(notificationError)
    expect(failed).toHaveBeenCalledTimes(2)
  })
  it('空の例外メッセージでも保存失敗を見失わない', () => {
    const changed = vi.fn(), guard = new PersistenceGuard(() => { throw new Error('') }, changed)
    expect(guard.save({})).toBe(false)
    expect(guard.error).toBe('Save failed')
    expect(changed).toHaveBeenCalledWith('Save failed')
  })
  it.each([false, true])('再試行成功時は障害前の手動停止状態 %s を復元する', initiallyPaused => {
    let paused = initiallyPaused
    const pause = new StoragePause(() => paused, value => { paused = value })
    pause.update('first failure'); expect(paused).toBe(true)
    pause.update('retry failure'); expect(paused).toBe(true)
    pause.update(); expect(paused).toBe(initiallyPaused)
    pause.update(); expect(paused).toBe(initiallyPaused)
  })
})

describe('設定の確定前公開を防ぐ', () => {
  it('保存と画面の復元通知が共に失敗した場合は両方の原因を返す', () => {
    const writeError = new Error('settings denied'), notifyError = new Error('renderer gone')
    let failure: unknown
    try { commitSettings({}, {}, () => { throw writeError }, () => { throw notifyError }) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([writeError, notifyError])
    expect((failure as Error).cause).toBe(writeError)
  })
  it('保存失敗時はlocaleを含む元の設定を保ち、旧状態を再配信する', () => {
    const current: Readonly<{ locale: string; autoStart: boolean }> = Object.freeze({ locale: 'ja', autoStart: false }), republish = vi.fn()
    const write = vi.fn(() => { throw new Error('settings denied') })
    expect(() => commitSettings(current, { locale: 'en' }, write, republish)).toThrow('settings denied')
    expect(current).toEqual({ locale: 'ja', autoStart: false })
    expect(write).toHaveBeenCalledWith({ locale: 'en', autoStart: false })
    expect(republish).toHaveBeenCalledOnce()
  })
  it('保存を完了した候補だけを新しい設定として返す', () => {
    const current = { locale: 'ja', autoStart: false }, write = vi.fn(), republish = vi.fn()
    const committed = commitSettings(current, { locale: 'en' }, write, republish)
    expect(committed).toEqual({ locale: 'en', autoStart: false })
    expect(current.locale).toBe('ja'); expect(republish).not.toHaveBeenCalled()
  })
})

describe('終了前保存と書き出しの保護', () => {
  function actions(save: boolean, choice = 0) {
    const order: string[] = []
    return { order,
      stop: vi.fn(() => { order.push('stop') }), save: vi.fn(() => { order.push('save'); return save }),
      choose: vi.fn(() => { order.push('choose'); return choice }), export: vi.fn(() => { order.push('export') }),
      restart: vi.fn(() => { order.push('restart') }),
    }
  }
  it('進行タイマーを止めてから保存し、成功時だけ終了を承認する', () => {
    const callbacks = actions(true)
    expect(confirmSavedQuit(callbacks)).toBe(true)
    expect(callbacks.order).toEqual(['stop', 'save'])
  })
  it('保存失敗後に戻るを選んだらタイマーを戻し、未保存データを捨てない', () => {
    const callbacks = actions(false)
    expect(confirmSavedQuit(callbacks)).toBe(false)
    expect(callbacks.order).toEqual(['stop', 'save', 'choose', 'restart'])
  })
  it('書き出しを選んでも勝手に終了せず、停止中のゲームへ戻す', () => {
    const callbacks = actions(false, 1)
    expect(confirmSavedQuit(callbacks)).toBe(false)
    expect(callbacks.order).toEqual(['stop', 'save', 'choose', 'export', 'restart'])
  })
  it('本人が保存せず終了を選んだ場合だけ失敗した保存のまま終了する', () => {
    const callbacks = actions(false, 2)
    expect(confirmSavedQuit(callbacks)).toBe(true)
    expect(callbacks.order).toEqual(['stop', 'save', 'choose'])
  })
  it.each(['save', 'choose', 'export'] as const)('%sが例外になっても停止したホストを戻す', stage => {
    const callbacks = actions(false, 1)
    callbacks[stage].mockImplementation(() => { throw new Error(stage + ' unavailable') })
    expect(() => confirmSavedQuit(callbacks)).toThrow('unavailable')
    expect(callbacks.restart).toHaveBeenCalledOnce()
  })
  it('書き出しで既存のセーブ/設定/世代ファイルを上書きさせない', () => {
    const base = join('isolated-verification', 'profile'), managed = [join(base, 'save.json'), join(base, 'save.prev.json'), join(base, 'settings.json')]
    expect(isProtectedExport(managed[0], managed)).toBe(true)
    expect(isProtectedExport(managed[1] + '.tmp', managed)).toBe(true)
    expect(isProtectedExport(join(base, 'child', '..', 'settings.json'), managed)).toBe(true)
    expect(isProtectedExport(managed[0].toUpperCase(), managed)).toBe(true)
    expect(isProtectedExport(join(base, 'exported-copy.json'), managed)).toBe(false)
  })
})
