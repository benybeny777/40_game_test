import { describe, expect, it } from 'vitest'
import { win32 } from 'node:path'
import { resolvePaths } from '../src/main/paths'
import { dotPxFor, HEADROOM_DIP, stripLayout } from '../src/main/windows/placement'

describe('帯の配置とドット倍率', () => {
  it('1ドットは整数の物理ピクセル（100%→3、125%→3、150%→4、200%→5）', () => {
    expect([1, 1.25, 1.5, 2].map((scale) => dotPxFor(scale))).toEqual([3, 3, 4, 5])
    expect(dotPxFor(1, 'small')).toBe(2)
    expect(dotPxFor(1.5, 'large')).toBe(5)
  })
  it('下タスクバーの直上に、遊ぶ領域＋上の余白の高さで置く', () => {
    const { bounds, layout } = stripLayout({ x: 0, y: 0, width: 1920, height: 1032 }, 1)
    expect(bounds).toEqual({ x: 0, y: 1032 - (96 + HEADROOM_DIP), width: 1920, height: 96 + HEADROOM_DIP })
    expect(layout.dotPx).toBe(3)
  })
  it('150%では端数を切り上げ、下端を作業領域に揃える', () => {
    const { bounds } = stripLayout({ x: 0, y: 0, width: 1707, height: 1000 }, 1.5)
    expect(bounds.height).toBe(Math.ceil(32 * 4 / 1.5) + HEADROOM_DIP)
    expect(bounds.y + bounds.height).toBe(1000)
  })
  it('負の座標や上側の作業領域を保つ', () => {
    const { bounds } = stripLayout({ x: -1280, y: -200, width: 1280, height: 720 }, 1)
    expect(bounds.x).toBe(-1280); expect(bounds.y + bounds.height).toBe(520)
  })
})

describe('プロファイルの分離', () => {
  const root = process.cwd()
  const user = win32.join('C:', 'Users', 'example', 'AppData', 'Roaming', 'game')
  it('開発データとセーブをプロジェクト内へ隔離する', () => {
    const dev = resolvePaths(root, user, 'dev')
    expect(dev.profile).toBe('dev')
    expect(dev.save).toContain('.dev-data')
    expect(dev.settings).toContain('.dev-data')
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
