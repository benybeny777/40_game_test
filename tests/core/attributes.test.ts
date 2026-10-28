import { describe, expect, it } from 'vitest'
import { advance, applyRewards, attributeBalance, attributeDefs, availablePoints, buildView, computeStats, createGame, deployedJobs, equipCheck, expToNext, jobs, newProfile, partyOrder, runCommand, validateProfile } from '../../src/core/index.ts'
import { rollItem, type Item } from '../../src/core/progress/items.ts'
import { rarities, uniqueDefs } from '../../src/core/data/items.ts'
import { emptyAttributes } from '../../src/core/data/attributes.ts'

function mythic(id: string) {
  const state = { rng: 9 }
  for (let roll = 0; roll < 1000; roll++) {
    const item = rollItem(state, `u${roll}`, { ilvl: 60, luk: 0, jobs: partyOrder, minRarity: 5, maxRarity: 5 })
    if (item.uniqueId === id) return item
  }
  throw new Error('missing unique')
}
const dexWeapon = (): Item => ({ id: 'gale', slot: 'weapon', job: 'ninja', ilvl: 60, rarity: 5, name: '疾風の牙', uniqueId: 'gale', requirements: { str: 0, dex: 100, vit: 10, int: 0 },
  atk: 100, hp: 0, def: 0, locked: false, isNew: false, baseRoll: 1, affixes: [] })

describe('4能力・自由なビルド', () => {
  it('レベルアップした出撃3名だけが3ptを得て、控えへは自動配分しない', () => {
    const profile = newProfile('t')
    applyRewards(profile, [{ t: 'reward', koban: 0, exp: expToNext(1), enemyId: '', x: 0 }])
    for (const job of partyOrder) {
      const member = profile.party.members[job]
      if (deployedJobs(profile.party.order).includes(job)) {
        expect(Object.values(member.allocated).reduce((sum, value) => sum + value, 0)).toBe(attributeBalance.pointsPerLevel)
        expect(member.allocated[attributeDefs[job].main]).toBeGreaterThan(0)
      } else {
        expect(member.lv).toBe(1); expect(member.exp).toBe(0)
        expect(Object.values(member.allocated).every(points => points === 0)).toBe(true)
      }
      expect(availablePoints(member)).toBe(0)
    }
  })
  it('手動配分は未使用範囲だけ可能で、自動ONは残りをすべて使う', () => {
    const profile = newProfile('t'), member = profile.party.members.samurai
    member.lv = 10; member.autoStats = false
    const game = createGame(profile, 1)
    expect(runCommand(game, { c: 'allocateStats', job: 'samurai', key: 'str', points: 20 }).ok).toBe(true)
    expect(availablePoints(member)).toBe(7)
    expect(runCommand(game, { c: 'allocateStats', job: 'samurai', key: 'vit', points: 8 }).ok).toBe(false)
    expect(runCommand(game, { c: 'allocateStats', job: 'samurai', key: 'vit', points: 1.5 }).ok).toBe(false)
    runCommand(game, { c: 'setAutoStats', job: 'samurai', enabled: true })
    expect(availablePoints(member)).toBe(0)
    expect(member.autoStats).toBe(true)
  })
  it('低Lvでもステが足りれば高ランクを装着でき、高Lvでもステ不足は拒否する', () => {
    const profile = newProfile('t'), member = profile.party.members.ninja
    member.lv = 31; member.autoStats = false; member.allocated = { str: 0, dex: 86, vit: 3, int: 0 }
    const item = dexWeapon(); profile.inventory.push(item)
    expect(member.lv).toBeLessThan(item.ilvl)
    expect(equipCheck(profile, 'ninja', item).ok).toBe(true)
    const game = createGame(profile, 1)
    expect(runCommand(game, { c: 'equip', job: 'ninja', slot: 'weapon', itemId: item.id }).ok).toBe(true)
    member.lv = 60; member.allocated = emptyAttributes()
    const denied = equipCheck(profile, 'ninja', item)
    expect(denied.ok).toBe(false)
    expect(!denied.ok && denied.reason).toContain('敏捷100必要')
    expect(!denied.ok && denied.reason).not.toContain('Lv')
    expect(equipCheck(profile, 'samurai', item).ok).toBe(false)
  })
  it('無料リセットで全回収・autoOFF、条件不足品は在庫へ戻り、HP割合を増やせない', () => {
    const profile = newProfile('t'), member = profile.party.members.ninja
    member.lv = 31; member.autoStats = false; member.allocated = { str: 0, dex: 86, vit: 3, int: 0 }
    const item = dexWeapon(); profile.inventory.push(item); member.equip.weapon = item.id; profile.koban = 123
    const game = createGame(profile, 1), unit = game.world.units.find((unit) => unit.defId === 'ninja')!
    unit.hp = unit.base.maxHp / 3
    for (let repeat = 0; repeat < 5; repeat++) {
      expect(runCommand(game, { c: 'resetStats', job: 'ninja' }).ok).toBe(true)
      expect(member.autoStats).toBe(false); expect(availablePoints(member)).toBe(90)
      expect(member.equip.weapon).toBeNull(); expect(profile.inventory).toContain(item)
      expect(unit.hp / unit.base.maxHp).toBeCloseTo(1 / 3)
      runCommand(game, { c: 'allocateStats', job: 'ninja', key: 'dex', points: 86 })
      runCommand(game, { c: 'allocateStats', job: 'ninja', key: 'vit', points: 3 })
      runCommand(game, { c: 'equip', job: 'ninja', slot: 'weapon', itemId: item.id })
      expect(unit.hp / unit.base.maxHp).toBeCloseTo(1 / 3)
    }
    expect(profile.koban).toBe(123)
  })
  it('知力主職はスキルと回復に使うATKが増し、体力・敏捷も異なる長所を持つ', () => {
    const base = computeStats(jobs.miko, 40)
    const intelligence = computeStats(jobs.miko, 40, {}, [], { str: 0, dex: 0, vit: 0, int: 100 })
    expect(intelligence.atk).toBeCloseTo(base.atk * 2.5)
    const vitality = computeStats(jobs.miko, 40, {}, [], { str: 0, dex: 0, vit: 100, int: 0 })
    expect(vitality.maxHp).toBeCloseTo(base.maxHp + 600)
    const dexterity = computeStats(jobs.miko, 40, {}, [], { str: 0, dex: 100, vit: 0, int: 0 })
    expect(dexterity.intervalMs).toBeLessThan(base.intervalMs); expect(dexterity.cri).toBeGreaterThan(base.cri)
  })
  it('旧v3属性なしを補完し、過剰なポイントや壊れた抽選値は拒否する', () => {
    const profile = newProfile('t'); profile.party.members.samurai.lv = 20
    const raw = JSON.parse(JSON.stringify(profile)); delete raw.party.members.samurai.allocated; delete raw.party.members.samurai.autoStats
    const restored = validateProfile(raw)
    expect(availablePoints(restored.party.members.samurai)).toBe(0)
    expect(Object.values(restored.party.members.samurai.allocated).reduce((sum, value) => sum + value, 0)).toBe(57)
    raw.party.members.samurai.allocated = { str: 999, dex: 0, vit: 0, int: 0 }
    expect(() => validateProfile(raw)).toThrow('bad allocation')
  })
})

describe('神話ユニーク・基礎性能の抽選', () => {
  it('4系統の極振り装備は固定したステ要求と特長/代償を持ち、ローカル品は取引適格にしない', () => {
    expect(rarities).toHaveLength(6)
    for (const id of Object.keys(uniqueDefs)) {
      const item = mythic(id)
      expect(item.rarity).toBe(5); expect(item.requirements).toEqual(uniqueDefs[id].requirements)
      expect(item.marketEligible).toBe(false)
      expect('level' in item.requirements!).toBe(false)
      expect(item.affixes).toEqual(expect.arrayContaining(uniqueDefs[id].affixes))
    }
    expect(uniqueDefs.titan.affixes).toContainEqual({ k: 'intervalPct', v: 0.35 })
    expect(uniqueDefs.bastion.affixes).toContainEqual({ k: 'atkPct', v: -0.15 })
  })
  it('極振りだけが高要求装備に届き、平均振りは同レベルでも届かない', () => {
    const profile = newProfile('t'), member = profile.party.members.samurai
    member.lv = 60; member.autoStats = false
    const item = { ...mythic('titan'), job: 'samurai' as const }
    member.allocated = { str: 44, dex: 44, vit: 44, int: 44 }
    expect(equipCheck(profile, 'samurai', item).ok).toBe(false)
    member.allocated = { str: 120, dex: 0, vit: 57, int: 0 }
    expect(equipCheck(profile, 'samurai', item).ok).toBe(true)
    const withItem = computeStats(jobs.samurai, 60, {}, [item], member.allocated)
    const without = computeStats(jobs.samurai, 60, {}, [], member.allocated)
    expect(withItem.atk).toBeGreaterThan(without.atk * 5)
    expect(withItem.intervalMs).toBeGreaterThan(without.intervalMs)
  })
  it('同じ名称/レア度/ランクにも85〜115%の幅があり、seedで再現する', () => {
    const roll = () => {
      const state = { rng: 27 }
      return Array.from({ length: 500 }, (_, index) => rollItem(state, `r${index}`, { ilvl: 5, luk: 0, jobs: ['samurai'], minRarity: 0, maxRarity: 0 }))
    }
    const items = roll()
    expect(roll()).toEqual(items)
    expect(items.every((item) => item.baseRoll! >= 0.85 && item.baseRoll! <= 1.15)).toBe(true)
    const swords = items.filter((item) => item.slot === 'weapon')
    expect(new Set(swords.map((item) => item.name)).size).toBe(1)
    expect(new Set(swords.map((item) => item.atk)).size).toBeGreaterThan(10)
  })
  it('旧品の基礎性能は100%として保持し、条件と抽選幅を日本語で表示する', () => {
    const profile = newProfile('t'); profile.inventory.push({ ...dexWeapon(), baseRoll: undefined })
    const restored = validateProfile(JSON.parse(JSON.stringify(profile)))
    expect(restored.inventory[0].atk).toBe(100); expect(restored.inventory[0].baseRoll).toBe(1)
    const view = buildView(restored, false).inventory[0]
    expect(view.rollLabel).toContain('100%（85〜115%）')
    expect(view.requirements).toContain('敏捷100')
    expect(view.lines.join(' ')).not.toMatch(/必要Lv|装備Lv|Lv.*装備/)
    const raw = JSON.parse(JSON.stringify(restored)); raw.inventory[0].baseRoll = 1.5
    expect(() => validateProfile(raw)).toThrow('bad item roll')
    expect(advance(createGame(restored, 1)).events).toBeDefined()
  })
})
