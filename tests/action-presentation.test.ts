import { describe, expect, it } from 'vitest'
import { partyOrder } from '../src/core/data/jobs.ts'
import { balance } from '../src/core/data/balance.ts'
import { actionPose, actionTiming, hitFeedbackDue, hitRecoil, meleeDashDistance, normalWindupMs } from '../src/renderer/strip/actionPresentation'
import { GAME_SPEED } from '../src/core/data/timing'

describe('戦闘アクションの表示時間', () => {
  it('コアの刻みで切り上げた溜めの後に打撃姿へ切り替え、素早く元へ戻る', () => {
    const windup = normalWindupMs()
    expect(windup % balance.tickMs).toBe(0)
    expect(windup).toBeGreaterThanOrEqual(balance.windupMs)
    expect(actionPose('samurai', 'ally', windup - 1, windup).attack).toBe(false)
    expect(actionPose('samurai', 'ally', windup, windup)).toMatchObject({ attack: true, dx: 8, dy: -2 })
    const recovered = actionPose('samurai', 'ally', windup + 250, windup)
    expect(recovered).toMatchObject({ active: false, dx: 0, dy: 0 })
  })

  it('17人の動きは整数ピクセルで、槍・張り手・跳躍・ナイフ・扇・本を区別する', () => {
    for (const job of partyOrder) for (const age of [-1, 0, 45, 100, 200, 300, 500]) {
      const pose = actionPose(job, 'ally', age, 100)
      for (const value of [pose.dx, pose.dy, pose.width, pose.height]) expect(Number.isInteger(value)).toBe(true)
    }
    const strike = (id: string) => actionPose(id, 'ally', 100, 100)
    expect(strike('farmer')).toMatchObject({ style: 'thrust', dx: 11 })
    expect(strike('rikishi')).toMatchObject({ style: 'palm', width: 4 })
    expect(strike('jiangshi')).toMatchObject({ style: 'hop', dy: -8 })
    expect(strike('maid')).toMatchObject({ style: 'toss', dy: -3 })
    expect(strike('tono').style).toBe('fan')
    expect(strike('gariben').style).toBe('book')
    expect(actionPose('ooni', 'enemy', 100, 100).dx).toBeLessThan(0)
  })

  it('命中反動を短く局所化し、停止時間より長く全体を凍らせない', () => {
    expect(actionTiming.hitStopMs).toBeLessThan(balance.tickMs)
    expect(hitRecoil(0, true, true)).toBe(4)
    expect(hitRecoil(0, false)).toBe(-2)
    expect(hitRecoil(actionTiming.knockMs, true)).toBe(0)
    expect(hitRecoil(-1, true)).toBe(0)
  })
  it('keeps impacts readable without extending a white flash across repeated hits', () => {
    expect(actionTiming.hitStopMs / GAME_SPEED).toBe(45)
    expect(actionTiming.flashMs / GAME_SPEED).toBe(65)
    expect(hitFeedbackDue(undefined, 1000)).toBe(true)
    expect(hitFeedbackDue(1000, 1000 + 50 * GAME_SPEED)).toBe(false)
    expect(hitFeedbackDue(1000, 1000 + 150 * GAME_SPEED)).toBe(false)
    expect(hitFeedbackDue(1000, 1000 + 160 * GAME_SPEED)).toBe(true)
  })

  it('後列の通常近接だけ敵の手前へ出て、敵を越えず元の位置へ戻る', () => {
    const front = meleeDashDistance('samurai', 100, 130, 0)
    const rear = meleeDashDistance('samurai', 36, 130, 2)
    expect(front).toBe(8)
    expect(rear).toBe(76)
    const approach = actionPose('samurai', 'ally', 75, 100, false, rear)
    expect(approach.dx).toBeGreaterThan(8)
    expect(approach.dx).toBeLessThan(rear)
    expect(approach.attack).toBe(false)
    expect(actionPose('samurai', 'ally', 100, 100, false, rear).dx).toBe(76)
    expect(actionPose('samurai', 'ally', 250, 100, false, rear).dx).toBeLessThan(76)
    expect(actionPose('samurai', 'ally', 310, 100, false, rear).dx).toBe(0)
    expect(actionPose('maid', 'ally', 100, 100, true, rear).dx).toBe(5)
    expect(actionPose('samurai', 'ally', 100, 100).dx).toBe(8)
    expect(meleeDashDistance('farmer', 100, 110, 2)).toBe(0)
    expect(meleeDashDistance('samurai', 100, 90, 2)).toBe(0)
    expect(meleeDashDistance('samurai', 0, 1000, 2)).toBe(90)
    expect(meleeDashDistance('farmer', 100, 130, 0)).toBe(11)
  })
})
