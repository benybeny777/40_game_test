import { describe, expect, it } from 'vitest'
import { enemies } from '../src/core/data/enemies.ts'
import type { SnapshotUnit } from '../src/core/sim/types.ts'
import { enemyArt } from '../src/shared/art'
import { enemyGuide } from '../src/shared/enemyGuide'
import { damageText, enemyMotion, enemyRank, enemyScale } from '../src/renderer/strip/enemyPresentation'

const enemy = (defId: string, side: SnapshotUnit['side'] = 'enemy') => ({ defId, side }) as SnapshotUnit

describe('敵の識別と攻略情報', () => {
  it('12種の実敵と2種の派生に素材と攻略情報がある', () => {
    const visible = Object.values(enemies).filter(def => !def.hidden)
    expect(visible).toHaveLength(12)
    expect(new Set(visible.map(def => def.id))).toEqual(new Set(enemyArt))
    for (const def of visible) {
      expect(enemyGuide(def.id).role).not.toBe('不明')
      expect(enemyGuide(def.id).tactic.length).toBeGreaterThan(10)
    }
    expect(enemyScale('bugsei_child')).toBeLessThan(enemyScale('bugsei'))
    expect(enemyScale('kyubi_phantom')).toBeLessThan(enemyScale('denno_kyubi'))
    for (const def of Object.values(enemies).filter(def => def.hidden)) expect(enemyArt).toContain(def.sprite)
  })

  it('最終ウェーブの強敵と10階ごとの大ボスを混同しない', () => {
    expect(enemyRank(enemy('chochin'), { stageNo: 9, wave: 9 })).toBe('normal')
    expect(enemyRank(enemy('chochin'), { stageNo: 9, wave: 10 })).toBe('elite')
    expect(enemyRank(enemy('ooni'), { stageNo: 10, wave: 10 })).toBe('boss')
    expect(enemyRank(enemy('manekimodoki'), { stageNo: 20, wave: 10 })).toBe('normal')
    expect(enemyRank(enemy('samurai', 'ally'), { stageNo: 9, wave: 10 })).toBe('normal')
    expect(enemyRank(enemy('kappa'), { stageNo: 10001, wave: 10 })).toBe('elite')
  })

  it('小判・分裂・後衛狙い・自爆の説明は実traitsに対応する', () => {
    expect(enemyGuide('manekimodoki').role).toContain('小判')
    expect(enemyGuide('bugsei').role).toContain('分裂')
    expect(enemyGuide('noroifig').role).toContain('後衛')
    expect(enemyGuide('popuponi').role).toContain('自爆')
    expect(enemyGuide('ooni').role).toContain('前列')
    expect(enemyGuide('manekitaisho').role).toContain('召喚')
    expect(enemyGuide('denno_kyubi').role).toContain('幻影')
  })

  it('長時間後も整数の小さな動きにとどまり、固定砲台は移動表現しない', () => {
    for (const def of Object.values(enemies)) for (const now of [0, 1234, 8 * 60 * 60 * 1000, 1e12]) {
      const motion = enemyMotion(def.id, 'move', now, 101)
      expect(Number.isInteger(motion.dx)).toBe(true)
      expect(Number.isInteger(motion.dy)).toBe(true)
      expect(Math.abs(motion.dx)).toBeLessThanOrEqual(2)
      expect(Math.abs(motion.dy)).toBeLessThanOrEqual(5)
    }
    expect(enemyMotion('noroifig', 'none', 350, 1)).toEqual({ dx: 0, dy: 0 })
    expect(enemyMotion('bakeneko', 'none', 350, 1)).toEqual({ dx: 0, dy: 0 })
  })
})

describe('戦闘の数字表示', () => {
  it('実数の誤差をUIへ流さず、小数・ゼロ・会心を整数で読む', () => {
    expect(damageText(1.3999999999999915)).toBe('1')
    expect(damageText(2 - Number.EPSILON)).toBe('2')
    expect(damageText(13.5)).toBe('14')
    expect(damageText(0)).toBe('0')
    expect(damageText(1042)).toBe('1042')
    expect(damageText(Number.NaN)).toBe('0')
    expect(damageText(Number.POSITIVE_INFINITY)).toBe('0')
  })
})
