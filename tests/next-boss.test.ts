import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextBoss } from '../src/shared/nextBoss'
import { areaOf } from '../src/core/data/stages'
import { buildView, newProfile } from '../src/core/index'
import { renderNextBoss } from '../src/renderer/panel/nextBoss'
import { setLocale } from '../src/shared/i18n'
import { bossPattern } from '../src/core/data/bossPatterns'

afterEach(() => { vi.unstubAllGlobals(); setLocale('ja') })
describe('upcoming boss preparation', () => {
  it('previews the actual boss-floor pattern and higher-difficulty progression, not the current floor pattern', () => {
    expect(nextBoss(39, 0)?.skill.id).toBe('shoufuku')
    expect(nextBoss(49, 0)).toMatchObject({ floor: 50, late: true, skill: { id: 'kanabo_sweep', targets: 3 } })
    expect(nextBoss(59, 0)).toMatchObject({ floor: 60, skill: { id: 'kitsunebi_rear', targets: 2 } })
    expect(nextBoss(1, 1)).toMatchObject({ floor: 10, late: false, skill: { id: 'shoufuku' } })
    expect(nextBoss(49, 0)?.guide.tactic).toContain('前方三人')
    expect(nextBoss(49, 0)?.guide.tactic).not.toContain('前の二人')
    for (const rank of [0, 1, 2] as const) for (const depth of [19, 49, 79, 99]) {
      const preview = nextBoss(depth, rank)!
      const actual = bossPattern(preview.enemyId, preview.floor, rank)!
      expect(preview.skill).toEqual(actual.skill)
      expect(preview.secondPhase).toEqual(actual.secondPhase)
      if (actual.late) expect(preview.guide.tactic).toBe(actual.description)
    }
  })
  it('uses actual cyclic areas, including the current boss floor and difficulty boundaries', () => {
    expect(nextBoss(1, 0)).toMatchObject({ floor: 10, enemyId: 'manekitaisho', areaDamage: true })
    expect(nextBoss(10, 0)?.floor).toBe(10)
    expect(nextBoss(11, 0)).toMatchObject({ floor: 20, enemyId: 'ooni', roles: ['tank', 'healer', 'debuffer'] })
    expect(nextBoss(21, 0)).toMatchObject({ floor: 30, enemyId: 'denno_kyubi', areaDamage: true })
    for (const depth of [1, 10, 11, 21, 99, 100]) {
      const boss = nextBoss(depth, 0)!
      expect(boss.enemyId).toBe(areaOf(boss.floor).boss)
      expect(boss.floor).toBeLessThanOrEqual(100)
    }
    expect(nextBoss(101, 2)?.floor).toBe(110)
    expect(nextBoss(Number.MAX_SAFE_INTEGER, 2)).toBeNull()
    expect(() => nextBoss(101, 0)).toThrow('Invalid boss preview')
  })
  it('shows the queued destination instead of the old route and translates the compact card', () => {
    class Node {
      children: Array<Node | string> = []
      setAttribute() {}
      addEventListener() {}
      append(...nodes: Array<Node | string>) { this.children.push(...nodes) }
      text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
    }
    vi.stubGlobal('document', { createElement: () => new Node() })
    setLocale('en')
    const view = buildView(newProfile('test'), false, { stageNo: 21, depthRank: 1 })
    const text = (renderNextBoss(view) as unknown as Node).text()
    expect(text).toContain('Boss after queued travel:')
    expect(text).toContain('B30')
    expect(text).toContain('area attacks')
    expect(text).toContain('First-clear reward')
    expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    view.dungeon.pendingTravel = { depth: 100, difficulty: 0 }
    const climax = (renderNextBoss(view) as unknown as Node).text()
    expect(climax).toContain('Hundred-floor climax: the skill changes at half HP')
    expect(climax).toContain('Acrobat Troupe')
    expect(climax).toContain('Clear to unlock')
    expect(climax).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    expect(climax).not.toContain('Inventory full')
    view.inventoryCount = view.inventoryMax
    expect((renderNextBoss(view) as unknown as Node).text()).toContain('including the new reward')
    view.dungeon.unlockedDepths = [100, 1, 0]
    const replay = (renderNextBoss(view) as unknown as Node).text()
    expect(replay).toContain('First-clear reward already earned')
    expect(replay).not.toContain('Clear to unlock')
  })
})
