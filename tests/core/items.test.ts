import { describe, expect, it } from 'vitest'
import { addOffline, applyRewards, claimOffline, computeOffline, createGame, createWorld, newProfile, runCommand, step, validateProfile, type Profile, type SimEvent, type World } from '../../src/core/index.ts'
import { rarities } from '../../src/core/data/items.ts'
import { dropItem } from '../../src/core/progress/profile.ts'
import { equipItem, gearMap, receiveItem, rollItem, scoreDelta, statsOf, type Item } from '../../src/core/progress/items.ts'
import { stageMul } from '../../src/core/sim/world.ts'

const weapon = (profile: Profile, job: Item['job'], atk: number): Item => ({ id: `i${profile.nextItemId++}`, slot: 'weapon', job, ilvl: 1, rarity: 0, name: 'テスト刀',
  locked: false, isNew: true, atk, hp: 0, def: 0, affixes: [] })
function battleAt(stageNo: number, wave = 1): World {
  const world = createWorld({ stageNo, level: 30 }); world.wave = wave
  for (let count = 0; world.phase !== 'battle' && count < 3000; count++) step(world)
  return world
}

describe('装備（03 §3）', () => {
  it('レア度の比率は重みどおり（10万回で±1%）', () => {
    const state = { rng: 7 }, counts = [0, 0, 0, 0, 0]
    for (let index = 0; index < 100000; index++) counts[rollItem(state, 'x', { ilvl: 1, luk: 0, jobs: ['samurai'] }).rarity]++
    const total = rarities.reduce((sum, rarity) => sum + rarity.weight, 0)
    counts.forEach((count, rarity) => expect(Math.abs(count / 1000 - rarities[rarity].weight / total * 100)).toBeLessThan(1))
  })
  it('付加効果はレア度の数だけ付き、同じ種類は重ならない', () => {
    const state = { rng: 3 }
    for (let index = 0; index < 2000; index++) {
      const item = rollItem(state, 'x', { ilvl: 5, luk: 0, jobs: ['ninja'] })
      expect(item.affixes).toHaveLength(rarities[item.rarity].affixes + (item.slot === 'charm' ? 1 : 0))
      expect(new Set(item.affixes.map((affix) => affix.k)).size).toBe(item.affixes.length)
      if (item.slot === 'weapon') expect(item.job).toBe('ninja')
    }
  })
  it('武器はそのジョブだけが装備でき、装備すると能力値に反映される', () => {
    const profile = newProfile('t')
    const katana = weapon(profile, 'samurai', 10); profile.inventory.push(katana)
    expect(equipItem(profile, 'ninja', 'weapon', katana.id).ok).toBe(false)
    const before = statsOf(profile, 'samurai').atk
    expect(equipItem(profile, 'samurai', 'weapon', katana.id)).toEqual({ ok: true })
    expect(statsOf(profile, 'samurai').atk).toBeCloseTo(before + 10)
    expect(scoreDelta(profile, 'ninja', katana)).toBeNull()
  })
  it('自動装備は強い装備だけを付け替え、売却は装備中・ロック中を拒否する', () => {
    const profile = newProfile('t')
    const strong = weapon(profile, 'samurai', 10)
    expect(receiveItem(profile, strong).equippedBy).toBe('samurai')
    expect(receiveItem(profile, weapon(profile, 'samurai', 1)).equippedBy).toBeUndefined()
    const game = createGame(profile, 1)
    expect(runCommand(game, { c: 'sell', itemIds: [strong.id] }).ok).toBe(false)
    const spare = profile.inventory.find((item) => item.id !== strong.id)!
    runCommand(game, { c: 'lock', itemId: spare.id, locked: true })
    expect(runCommand(game, { c: 'sell', itemIds: [spare.id] }).ok).toBe(false)
    runCommand(game, { c: 'lock', itemId: spare.id, locked: false })
    expect(runCommand(game, { c: 'sell', itemIds: [spare.id] })).toEqual({ ok: true })
    expect(profile.koban).toBeGreaterThan(0)
  })
  it('自動売却：指定したレア度以下は拾った時点で売る', () => {
    const profile = newProfile('t'); profile.options.autoEquip = false; profile.options.autoSellMaxRarity = 1
    expect(receiveItem(profile, weapon(profile, 'otaku', 1)).sold).toBe(true)
    expect(profile.inventory).toHaveLength(0)
  })
  it('所持の上限を超えたら、装備していない一番弱い装備を売る', () => {
    const profile = newProfile('t'); profile.options.autoEquip = false
    for (let index = 0; index < 101; index++) receiveItem(profile, { ...weapon(profile, 'jirai', 1), rarity: index === 0 ? 0 : 1 })
    expect(profile.inventory).toHaveLength(100)
    expect(profile.inventory.every((item) => item.rarity === 1)).toBe(true)
  })
  it('満杯の所持品でも自動装備のたびに上限を超えず、元の装備は保護する', () => {
    const profile = newProfile('t')
    const original = weapon(profile, 'samurai', 10)
    receiveItem(profile, original)
    for (let index = 0; index < 99; index++) receiveItem(profile, weapon(profile, 'samurai', 1))
    const upgrade = weapon(profile, 'samurai', 20)
    expect(receiveItem(profile, upgrade).equippedBy).toBe('samurai')
    expect(profile.inventory).toHaveLength(100)
    expect(profile.inventory).toContain(original)
    expect(profile.party.members.samurai.equip.weapon).toBe(upgrade.id)
  })
  it('所持品が全部ロック中なら、新しい装備を小判にして上限とロックを守る', () => {
    const profile = newProfile('t'); profile.options.autoEquip = false
    for (let index = 0; index < 100; index++) receiveItem(profile, { ...weapon(profile, 'samurai', 1), locked: true })
    profile.options.autoEquip = true
    const incoming = weapon(profile, 'samurai', 20)
    expect(receiveItem(profile, incoming)).toEqual({ sold: true })
    expect(profile.inventory).toHaveLength(100)
    expect(profile.inventory.every((item) => item.locked)).toBe(true)
    expect(profile.party.members.samurai.equip.weapon).toBeNull()
    expect(profile.koban).toBeGreaterThan(0)
  })
  it('オフライン装備は10分ごとに1個、並か上を受け取り、二重受け取りしない', () => {
    const profile = newProfile('t')
    profile.rates.minutes = [{ koban: 10, exp: 20 }]
    const reward = computeOffline(profile, 8 * 3600 * 1000)!
    expect(reward.items).toBe(48)
    addOffline(profile, reward)
    expect(claimOffline(profile).filter((event) => event.t === 'drop')).toHaveLength(48)
    expect(profile.inventory).toHaveLength(48)
    expect(profile.inventory.every((item) => item.rarity <= 1)).toBe(true)
    expect(claimOffline(profile)).toEqual([])
    expect(profile.inventory).toHaveLength(48)
  })
  it('夜回りの約束でオフライン報酬の上限が延び、最大8段階で止まる', () => {
    const profile = newProfile('t'); profile.koban = 1000000
    profile.rates.minutes = [{ koban: 10, exp: 20 }]
    const game = createGame(profile, 1)
    for (let index = 0; index < 8; index++) expect(runCommand(game, { c: 'buyDojo', key: 'offline' }).ok).toBe(true)
    expect(runCommand(game, { c: 'buyDojo', key: 'offline' }).ok).toBe(false)
    expect(computeOffline(profile, 24 * 3600 * 1000)?.ms).toBe(16 * 3600 * 1000)
    expect(validateProfile(JSON.parse(JSON.stringify(profile))).dojo.offline).toBe(8)
  })
  it('古い装備IDカウンターで読み込んでも、次のドロップのIDを重複させない', () => {
    const profile = newProfile('t')
    dropItem(profile, 1, 0, [])
    profile.nextItemId = 1
    const restored = validateProfile(JSON.parse(JSON.stringify(profile)))
    dropItem(restored, 1, 0, [])
    expect(new Set(restored.inventory.map((item) => item.id)).size).toBe(2)
    expect(validateProfile(JSON.parse(JSON.stringify(restored))).inventory).toHaveLength(2)
  })
  it('ボスは必ず上以上を落とす', () => {
    const profile = newProfile('t')
    const out = applyRewards(profile, [{ t: 'reward', koban: 1, exp: 0, enemyId: 'ooni', x: 0, stageNo: 5 }])
    const drop = out.events.find((event): event is Extract<SimEvent, { t: 'drop' }> => event.t === 'drop')
    expect(drop && drop.rarity >= 1).toBe(true)
    expect(profile.inventory[0].ilvl).toBe(5)
  })
  it('版1のセーブを版2へ移行し、壊れた装備の参照は拒否する', () => {
    const v1 = { version: 1, savedAt: 't', progress: { unlockedStage: 2, currentStage: 2, loop: false },
      party: { order: ['samurai', 'ninja', 'jirai', 'otaku', 'pachipro'], members: Object.fromEntries(['samurai', 'ninja', 'jirai', 'otaku', 'pachipro'].map((id) => [id, { lv: 3, exp: 1 }])) },
      koban: 50, dojo: { atk: 1, hp: 0, walk: 0 }, stats: { kills: 3 }, rates: { current: { koban: 0, exp: 0 }, minutes: [] }, seenEnemies: [], pendingOffline: null }
    const profile = validateProfile(v1)
    expect(profile.version).toBe(2); expect(profile.inventory).toEqual([]); expect(profile.party.members.ninja.equip.weapon).toBeNull()
    expect(profile.koban).toBe(50); expect(profile.dojo.drop).toBe(0)
    const broken = JSON.parse(JSON.stringify(newProfile('t')))
    broken.party.members.samurai.equip.weapon = 'i999'
    expect(() => validateProfile(broken)).toThrow('bad equip')
    const ok = newProfile('t'); dropItem(ok, 3, 0, [])
    expect(validateProfile(JSON.parse(JSON.stringify(ok))).inventory).toHaveLength(1)
    expect(Object.values(gearMap(ok)).flat().length + ok.inventory.filter((item) => !Object.values(gearMap(ok)).flat().includes(item)).length).toBe(1)
  })
})

describe('エリア2・3の敵（05 §2・§3）', () => {
  it('ステージの伸びはエリアごとの倍率を掛け合わせる', () => {
    expect(stageMul(1, [2, 3])).toBe(1)
    expect(stageMul(6, [2, 3])).toBe(2 ** 5)
    expect(stageMul(7, [2, 3])).toBe(2 ** 5 * 3)
  })
  it('エリア2・3のステージでは、そのエリアの敵とボスが出る', () => {
    const area2 = battleAt(6, 10).units.filter((unit) => unit.side === 'enemy').map((unit) => unit.defId)
    expect(area2).toContain('manekitaisho')
    const area3 = battleAt(11, 10).units.filter((unit) => unit.side === 'enemy').map((unit) => unit.defId)
    expect(area3).toContain('denno_kyubi')
  })
  it('バグ精霊は倒すと2体に分裂する（分裂した欠片は分裂しない）', () => {
    const world = battleAt(11)
    for (const unit of world.units.filter((candidate) => candidate.side === 'enemy')) { unit.defId = 'bugsei'; unit.hp = 0 }
    const events = step(world)
    const children = world.units.filter((unit) => unit.defId === 'bugsei_child')
    expect(children.length).toBe(2 * events.filter((event) => event.t === 'death' && world.units.find((unit) => unit.uid === event.uid)?.defId === 'bugsei').length)
    expect(world.phase).toBe('battle')
  })
  it('ポップアップ鬼は先頭に触れると自爆し、先頭の2人にダメージ', () => {
    const world = battleAt(11)
    const oni = world.units.find((unit) => unit.side === 'enemy')!
    oni.defId = 'popuponi'; oni.x = 15; oni.action = { kind: 'move', untilTick: 0 }
    for (const unit of world.units.filter((candidate) => candidate.side === 'enemy' && candidate !== oni)) unit.hp = 0
    const events = step(world)
    expect(events.some((event) => event.t === 'explode')).toBe(true)
    expect(new Set(events.filter((event) => event.t === 'damage' && event.tags?.includes('explode')).map((event) => 'uid' in event ? event.uid : 0)).size).toBe(2)
  })
  it('招き猫大将は手下を呼び、九尾はHP半分で幻影を2体出す', () => {
    const world = battleAt(6, 10)
    const boss = world.units.find((unit) => unit.defId === 'manekitaisho')!
    boss.x = 14; boss.skillReadyTick = 0
    const events = Array.from({ length: 5 }, () => step(world)).flat()
    expect(events.some((event) => event.t === 'skill' && event.skillId === 'shoufuku')).toBe(true)
    const kyubiWorld = battleAt(11, 10)
    const kyubi = kyubiWorld.units.find((unit) => unit.defId === 'denno_kyubi')!
    kyubi.hp = kyubi.stats.maxHp * 0.4
    step(kyubiWorld)
    expect(kyubiWorld.units.filter((unit) => unit.defId === 'kyubi_phantom' && unit.alive)).toHaveLength(2)
  })
  it('呪いのフィギュアは最後尾を狙い、その場から動かない', () => {
    const world = battleAt(11)
    const fig = world.units.find((unit) => unit.side === 'enemy')!
    fig.defId = 'noroifig'; fig.base.rangeDots = fig.stats.rangeDots = 200
    const x = fig.x
    const events = Array.from({ length: 30 }, () => step(world)).flat()
    const last = world.units.filter((unit) => unit.side === 'ally').at(-1)!
    expect(events.some((event) => event.t === 'attack' && event.uid === fig.uid && event.targetUid === last.uid)).toBe(true)
    expect(fig.x).toBe(x)
  })
})
