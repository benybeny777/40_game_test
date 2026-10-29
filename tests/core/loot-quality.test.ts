import { describe, expect, it } from 'vitest'
import { advance, applyRewards, createGame, equipCheck, newProfile, partyOrder, validateProfile, type SimEvent } from '../../src/core/index.ts'
import { lootRank, rollItem, receiveItem, equipItem, sellPrice, type Item } from '../../src/core/progress/items.ts'
import { dropItem } from '../../src/core/progress/profile.ts'

const clear = (floor: number, rank: 0 | 1 | 2 = 0): SimEvent => ({ t: 'phase', phase: 'stageClear', stageNo: floor, depthRank: rank, wave: 10 })
const katana = (id: string, atk: number, affixes: Item['affixes'] = []): Item => ({ id, slot: 'weapon', job: 'samurai', ilvl: 1, rarity: 3,
  name: 'test', locked: false, isNew: true, atk, hp: 0, def: 0, affixes })

describe('拾う・比較する・選ぶための装備報酬', () => {
  it('並の売値は撃破報酬と同じ緩やかな伸びで、終盤も指数にならない', () => {
    const item = katana('sale', 10)
    item.rarity = 0
    expect([1, 30, 60, 100].map((ilvl) => sellPrice({ ...item, ilvl }))).toEqual([5, 22, 40, 64])
    expect(Number.isFinite(sellPrice({ ...item, ilvl: Number.MAX_SAFE_INTEGER }))).toBe(true)
  })
  it('終盤の新防具はHPと防御を同じ指数で膨らませず、保存済み性能は変更しない', () => {
    const armor = (rank: number) => rollItem({ rng: 9 }, `armor${rank}`, { ilvl: rank, luk: 0, jobs: partyOrder, slot: 'armor', minRarity: 2, maxRarity: 2 })
    const early = armor(1), late = armor(100), deep = armor(1200)
    expect(late.hp / early.hp).toBeLessThan(20)
    expect(late.def / early.def).toBeLessThan(6)
    expect(deep.hp).toBeGreaterThan(late.hp)
    expect(deep.def).toBeGreaterThan(late.def)
    const old = newProfile('legacy')
    const legacy = armor(60)
    legacy.hp = 25000; legacy.def = 3000
    old.inventory.push(legacy)
    const restored = validateProfile(JSON.parse(JSON.stringify(old)))
    expect(restored.inventory[0]).toEqual(legacy)
  })
  it('新規20seedの実コア進行で5分以内に使える未装着武器を比較できる', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const profile = newProfile('t', seed), game = createGame(profile, seed)
      let offered = false
      for (let tick = 0; tick < 3000 && !offered; tick++) {
        advance(game)
        offered = profile.inventory.some(item => item.slot === 'weapon' && item.isNew && profile.party.order.slice(0, 3).includes(item.job!)
          && equipCheck(profile, item.job!, item).ok && profile.party.members[item.job!].equip.weapon !== item.id)
      }
      expect(offered, `seed ${seed}`).toBe(true)
    }
  })
  it('最初の1階クリアは出撃者が今すぐ使える武器を手動比較用に残し、再クリアでは増えない', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const profile = newProfile('t', seed)
      const result = applyRewards(profile, [clear(1)])
      expect(result.events.filter(event => event.t === 'drop')).toHaveLength(1)
      const item = profile.inventory[0]
      expect(item.slot).toBe('weapon'); expect(item.rarity).toBe(1); expect(item.isNew).toBe(true)
      expect(profile.party.order.slice(0, 3)).toContain(item.job)
      expect(profile.party.members[item.job!].equip.weapon).toBeNull()
      expect(equipItem(profile, item.job!, 'weapon', item.id).ok).toBe(true)
      const reloaded = validateProfile(JSON.parse(JSON.stringify(profile)))
      expect(applyRewards(reloaded, [clear(1)]).events.filter(event => event.t === 'drop')).toHaveLength(0)
    }
  })
  it('初回10階ごとに極以上、100階は伝説以上を残し、難度開放後の再戦で保証を重ねない', () => {
    for (const rank of [0, 1] as const) {
      const profile = newProfile('t')
      profile.progress.unlockedDepths[rank] = 10
      applyRewards(profile, [clear(10, rank)])
      expect(profile.inventory[0].rarity).toBeGreaterThanOrEqual(3)
      expect(profile.inventory[0].isNew).toBe(true)
      expect(applyRewards(profile, [clear(10, rank)]).events).toEqual([])
      profile.progress.unlockedDepths[rank] = 100
      applyRewards(profile, [clear(100, rank)])
      expect(profile.inventory[1].rarity).toBeGreaterThanOrEqual(4)
      expect(applyRewards(profile, [clear(100, rank)]).events).toEqual([])
    }
  })
  it('武器の約70%が出撃者向けで、控え全員の武器も出る', () => {
    const state = { rng: 7 }, active = ['samurai', 'ninja', 'otaku'] as const
    let useful = 0
    const seen = new Set<string>()
    for (let i = 0; i < 10000; i++) {
      const item = rollItem(state, `i${i}`, { ilvl: 1, luk: 0, jobs: partyOrder, activeJobs: active, slot: 'weapon', minRarity: 0, maxRarity: 0 })
      if ((active as readonly string[]).includes(item.job!)) useful++
      seen.add(item.job!)
    }
    expect(useful / 10000).toBeGreaterThan(0.68)
    expect(useful / 10000).toBeLessThan(0.72)
    expect(seen.size).toBe(17)
  })
  it('難度を進めても品質が逆戻りせず、極深層でも性能・売値・必要能力が有限', () => {
    expect(lootRank(100, 0)).toBeLessThan(lootRank(1, 1))
    expect(lootRank(100, 1)).toBeLessThan(lootRank(1, 2))
    const rolled = [60, 100, 101, 200, 201, Number.MAX_SAFE_INTEGER].map(ilvl => rollItem({ rng: 4 }, `i${ilvl}`, { ilvl, luk: 0, jobs: ['samurai'], slot: 'weapon', minRarity: 0, maxRarity: 0 }))
    rolled.forEach((item, index) => {
      expect(Number.isFinite(item.atk)).toBe(true)
      expect(Number.isSafeInteger(sellPrice(item))).toBe(true)
      expect(Object.values(item.requirements!).every(Number.isSafeInteger)).toBe(true)
      if (index) expect(item.atk).toBeGreaterThan(rolled[index - 1].atk)
    })
    const profile = newProfile('t'); profile.progress.depthRank = 2; profile.progress.unlockedDepths = [100, 100, 1]
    dropItem(profile, Number.MAX_SAFE_INTEGER, 0, [])
    expect(validateProfile(JSON.parse(JSON.stringify(profile))).inventory[0].ilvl).toBe(Number.MAX_SAFE_INTEGER)
  })
  it('自動装備は出撃者の上位互換に限り、会心や技能速度を失う交換・固有装備・控えは本人が選ぶ', () => {
    const profile = newProfile('t')
    const original = katana('old', 10, [{ k: 'cooldownPct', v: -0.1 }])
    expect(receiveItem(profile, original).equippedBy).toBe('samurai')
    expect(receiveItem(profile, katana('tradeoff', 100)).equippedBy).toBeUndefined()
    expect(receiveItem(profile, katana('upgrade', 20, [{ k: 'cooldownPct', v: -0.1 }])).equippedBy).toBe('samurai')
    const unique = { ...katana('unique', 200), uniqueId: 'titan', requirements: { str: 0, dex: 0, vit: 0, int: 0 } }
    expect(receiveItem(profile, unique).equippedBy).toBeUndefined()
    expect(equipItem(profile, 'samurai', 'weapon', unique.id).ok).toBe(true)
    expect(receiveItem(profile, katana('overwrite', 300)).equippedBy).toBeUndefined()
    expect(receiveItem(profile, { ...katana('reserve', 100), job: 'farmer' }).equippedBy).toBeUndefined()
    expect(profile.party.members.farmer.equip.weapon).toBeNull()
  })
})
