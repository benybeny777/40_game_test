import { describe, expect, it } from 'vitest'
import { win32 } from 'node:path'
import { resolvePaths } from '../src/main/paths'
import { stripBounds } from '../src/main/windows/placement'

describe('帯の配置（DIP）', () => {
  it('下タスクバーの直上に置く', () => {
    expect(stripBounds({ x: 0, y: 0, width: 1920, height: 1032 })).toEqual({ x: 0, y: 936, width: 1920, height: 96 })
  })
  it('自動で隠れるタスクバーでは画面下端に置く', () => {
    expect(stripBounds({ x: 0, y: 0, width: 1920, height: 1080 }).y).toBe(984)
  })
  it('負の座標や上側の作業領域を保つ', () => {
    expect(stripBounds({ x: -1280, y: -200, width: 1280, height: 720 })).toEqual({ x: -1280, y: 424, width: 1280, height: 96 })
  })
})

describe('プロファイルの分離', () => {
  const root = process.cwd()
  const user = win32.join('C:', 'Users', 'example', 'AppData', 'Roaming', 'game')
  it('開発データとセーブをプロジェクト内へ隔離する', () => {
    const dev = resolvePaths(root, user, 'dev')
    expect(dev.profile).toBe('dev')
    expect(dev.save).toContain('.dev-data')
    expect(dev.session.startsWith(dev.data)).toBe(true)
    expect(dev.save).not.toContain(user)
  })
  it('通常起動はuserDataを使用する', () => {
    const normal = resolvePaths(root, user, undefined)
    expect(normal.profile).toBe('user')
    expect(normal.data).toBe(user)
    expect(normal.previousSave).toContain('save.prev.json')
  })
})
