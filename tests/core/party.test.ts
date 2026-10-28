import { describe, expect, it } from 'vitest'
import {
  advance, applyRewards, balance, buildView, createGame, createWorld, defaultFormation, deployedJobs,
  expToNext, levels, newProfile, partyOrder, partySize, refreshParty, requestOrder, snapshot, step, validateProfile,
} from '../../src/core/index.ts'
import { dropChance, partyLuk } from '../../src/core/progress/items.ts'

const nextBattle = (world: ReturnType<typeof createWorld>) => {
  for (let count = 0; world.phase !== 'battle' && count < 2000; count++) step(world)
  expect(world.phase).toBe('battle')
}

describe('3人出撃と控え', () => {
  it('新規はサムライ・忍者・オタクで出撃し、控えは描画と戦闘から外す', () => {
    const profile = newProfile('t'), world = createGame(profile, 1).world
    expect(partySize).toBe(3)
    expect(profile.party.order).toEqual(defaultFormation)
    expect(world.units.map((unit) => unit.defId)).toEqual(['samurai', 'ninja', 'otaku'])
    expect(world.reserves.map((unit) => unit.defId)).toEqual(defaultFormation.slice(partySize))
    expect(snapshot(world).units).toHaveLength(3)
    const view = buildView(profile, false)
    expect(view.partySize).toBe(3)
    expect(view.party).toHaveLength(partyOrder.length)
    expect(view.party.filter((member) => member.active).map((member) => member.job)).toEqual(deployedJobs(defaultFormation))
    nextBattle(world)
    const reserveIds = world.reserves.map((unit) => unit.uid)
    for (let count = 0; count < 100; count++) {
      const events = step(world)
      expect(events.some((event) => 'uid' in event && reserveIds.includes(event.uid))).toBe(false)
    }
  })
  it('戦闘中の入れ替えは次ウェーブに反映し、予約時に敵・弾・HPを捨てない', () => {
    const world = createWorld()
    nextBattle(world)
    const samurai = world.units[0], reserve = world.reserves[0]
    samurai.hp = 41; reserve.hp = 37
    const enemies = world.units.filter((unit) => unit.side === 'enemy')
    const projectile = { id: world.nextId++, ownerUid: samurai.uid, targetUid: enemies[0].uid, launchTick: world.tick, hitTick: world.tick + 100, kind: 'ball', payload: { mul: 1 } }
    world.projectiles.push(projectile)
    const order = ['jirai', 'otaku', 'pachipro', ...partyOrder.filter((job) => !['jirai', 'otaku', 'pachipro'].includes(job))] as typeof partyOrder
    requestOrder(world, order)
    expect(world.units[0]).toBe(samurai)
    expect(samurai.hp).toBe(41)
    expect(world.units.filter((unit) => unit.side === 'enemy')).toEqual(enemies)
    expect(world.projectiles).toContain(projectile)
    // Enter the existing wave boundary without playing another fight.
    world.phase = 'waveClear'; world.phaseUntilTick = world.tick
    step(world)
    expect(world.units.map((unit) => unit.defId)).toEqual(order.slice(0, partySize))
    expect(world.units[0]).toBe(reserve)
    expect(reserve.hp).toBeCloseTo(37 + reserve.stats.maxHp * balance.walkHealPerSecond * balance.tickMs / 1000)
    expect(world.reserves).toContain(samurai)
    expect(samurai.hp).toBe(41)
    expect(world.units.map((unit) => unit.slot)).toEqual([0, 1, 2])
  })
  it('出撃だけが育ち、控えの経験値・能力配分・HP割合は変化しない', () => {
    const profile = newProfile('t'), game = createGame(profile, 1)
    const reserve = game.world.reserves[0]
    reserve.hp = reserve.base.maxHp / 2
    applyRewards(profile, [{ t: 'reward', koban: 0, exp: expToNext(1), enemyId: '', x: 0 }])
    expect(deployedJobs(profile.party.order).every(job => profile.party.members[job].lv === 2)).toBe(true)
    for (const job of profile.party.order.slice(partySize)) {
      expect(profile.party.members[job].lv).toBe(1)
      expect(profile.party.members[job].exp).toBe(0)
      expect(Object.values(profile.party.members[job].allocated).every(points => points === 0)).toBe(true)
    }
    refreshParty(game.world, levels(profile))
    expect(reserve.lv).toBe(1)
    expect(reserve.hp / reserve.base.maxHp).toBeCloseTo(0.5)
  })
  it('控えの運・ドロップ装備・パチプロ補正を入手判定に加えない', () => {
    const profile = newProfile('t')
    const initialRate = dropChance(profile, false), initialLuk = partyLuk(profile)
    profile.party.members.pachipro.lv = 50
    profile.inventory.push({ id: 'i1', slot: 'charm', ilvl: 1, rarity: 1, name: 'テスト守', locked: false, isNew: false,
      atk: 0, hp: 0, def: 0, affixes: [{ k: 'luk', v: 500 }, { k: 'dropPct', v: 5 }] })
    profile.party.members.pachipro.equip.charm = 'i1'
    expect(dropChance(profile, false)).toBe(initialRate)
    expect(partyLuk(profile)).toBe(initialLuk)
    profile.party.order = ['samurai', 'pachipro', 'otaku', ...partyOrder.filter((job) => !['samurai', 'pachipro', 'otaku'].includes(job))]
    expect(dropChance(profile, false)).toBeGreaterThan(initialRate)
    expect(partyLuk(profile)).toBeGreaterThan(initialLuk)
    expect(dropChance(profile, false, deployedJobs(defaultFormation))).toBe(initialRate)
  })
  it('予約した隊列が反映されるまで、戦闘で実際に出撃しているメンバーの運を使う', () => {
    const baseline = newProfile('t', 12345), pending = newProfile('t')
    baseline.inventory.push({ id: 'i1', slot: 'charm', ilvl: 1, rarity: 1, name: 'ドロップ確認用', locked: true, isNew: false,
      atk: 0, hp: 0, def: 0, affixes: [{ k: 'dropPct', v: 1000 }] })
    baseline.party.members.pachipro.equip.charm = 'i1'; baseline.nextItemId = 2
    pending.party.order = ['pachipro', 'jirai', 'ninja', ...partyOrder.filter((job) => !['pachipro', 'jirai', 'ninja'].includes(job))]
    const reference = createGame(baseline, 1), game = createGame(validateProfile(JSON.parse(JSON.stringify(baseline))), 1)
    nextBattle(reference.world); nextBattle(game.world)
    game.profile.party.order = pending.party.order
    requestOrder(game.world, pending.party.order)
    for (const world of [reference.world, game.world]) for (const unit of world.units) if (unit.side === 'enemy') unit.hp = 0
    advance(reference); advance(game)
    expect(reference.profile.stats.drops).toBe(0)
    expect(game.profile.rng).toBe(reference.profile.rng)
    expect(game.profile.inventory).toMatchObject(reference.profile.inventory)
  })
  it('旧版の5人隊列は順序・育成・装備を保ち、先頭3人で開始する', () => {
    const old = newProfile('t')
    old.version = 2
    old.party.order = partyOrder.slice(0, 5)
    old.party.members.pachipro.lv = 12
    old.inventory.push({ id: 'i1', slot: 'weapon', job: 'pachipro', ilvl: 1, rarity: 0, name: '玉の箱', locked: true, isNew: false,
      atk: 10, hp: 0, def: 0, affixes: [] })
    old.party.members.pachipro.equip.weapon = 'i1'; old.nextItemId = 2
    const restored = validateProfile(JSON.parse(JSON.stringify(old)))
    const world = createGame(restored, 1).world
    expect(restored.party.order).toEqual(partyOrder)
    expect(restored.party.members.pachipro.equip.weapon).toBe('i1')
    expect(restored.inventory).toMatchObject(old.inventory)
    expect(world.units.map((unit) => unit.defId)).toEqual(partyOrder.slice(0, partySize))
    expect(world.reserves.find((unit) => unit.defId === 'pachipro')?.lv).toBe(12)
    const v1 = validateProfile({ ...old, version: 1 })
    expect(v1.party.order).toEqual(partyOrder)
    expect(v1.party.members.pachipro.lv).toBe(12)
  })
})
