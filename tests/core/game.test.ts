import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addOffline, advance, applyRewards, balance as b, buyDojo, claimOffline, computeOffline, createGame, createWorld, dojoCost,
  deployedJobs, expToNext, newProfile, partyOrder, runCommand, step, validateProfile, type SimEvent, type World,
} from '../../src/core/index.ts'
import { skills, ultimates } from '../../src/core/sim/skills.ts'
import { loadProfile, saveProfile } from '../../src/main/saveStore.ts'

function battle(options: Parameters<typeof createWorld>[0] = {}) {
  const order = options.order ? [...options.order, ...partyOrder.filter((job) => !options.order!.includes(job))] : undefined
  const world = createWorld({ ...options, order })
  for (let count = 0; world.phase !== 'battle' && count < 2000; count++) step(world)
  return world
}
const ally = (world: World, job: string) => world.units.find((unit) => unit.side === 'ally' && unit.defId === job)!
const foes = (world: World) => world.units.filter((unit) => unit.side === 'enemy')
function hold(world: World) { for (const foe of foes(world)) { foe.x = 14; foe.hp = foe.base.maxHp = foe.stats.maxHp = 100000; foe.base.eva = 0 } }

describe('スキル・奥義（M3）', () => {
  it('居合の次の近接攻撃は必ず会心で、居合のタグが付く', () => {
    const world = battle(); hold(world)
    const samurai = ally(world, 'samurai')
    const events: SimEvent[] = []
    for (let count = 0; count < 200 && !events.some((event) => event.t === 'damage' && event.tags?.includes('iai')); count++) events.push(...step(world))
    const hit = events.find((event) => event.t === 'damage' && event.tags?.includes('iai'))
    expect(hit && hit.t === 'damage' && hit.crit && hit.sourceUid === samurai.uid).toBe(true)
  })
  it('差し入れは最大HPを超えて回復しない', () => {
    const world = battle(); hold(world)
    const target = ally(world, 'ninja'); target.hp = target.stats.maxHp - 1
    const events: SimEvent[] = []
    skills.sashiire.use({ world, self: ally(world, 'otaku'), events })
    expect(target.hp).toBeCloseTo(target.stats.maxHp)
  })
  it('差し入れは全員HP90%以上なら使わない', () => {
    const world = battle()
    expect(skills.sashiire.canUse({ world, self: ally(world, 'otaku'), events: [] })).toBe(false)
  })
  it('激重ラブボムは情念が多いほど強く、使うと情念が0になる', () => {
    const world = battle({ level: 10, order: ['samurai', 'jirai', 'otaku', 'ninja', 'pachipro'] }); hold(world)
    const jirai = ally(world, 'jirai'); jirai.gauges.jonen = 100
    const events: SimEvent[] = []
    ultimates.lovebomb({ world, self: jirai, events })
    expect(jirai.gauges.jonen).toBe(0)
    expect(events.filter((event) => event.t === 'damage').length).toBe(foes(world).length)
  })
  it('確変の当たり率は運がいくら高くても1/3を超えない', () => {
    const world = battle({ order: ['samurai', 'pachipro', 'otaku', 'ninja', 'jirai'] }); hold(world)
    const pachipro = ally(world, 'pachipro'); pachipro.stats = { ...pachipro.stats, luk: 1e6 }
    let hits = 0
    for (let count = 0; count < 3000; count++) {
      const events: SimEvent[] = []
      skills.kakuhen.use({ world, self: pachipro, events })
      if (events.some((event) => event.t === 'kakuhen' && event.hit)) hits++
    }
    expect(hits / 3000).toBeGreaterThan(0.28); expect(hits / 3000).toBeLessThan(0.38)
  })
  it('奥義はLv10未満では使われず、Lv10ではゲージ満タンで発動する', () => {
    const low = battle({ level: 9 }); hold(low); ally(low, 'ninja').ult = 100
    expect(Array.from({ length: 30 }, () => step(low)).flat().some((event) => event.t === 'ultimate')).toBe(false)
    const high = battle({ level: b.ultLv }); hold(high); ally(high, 'ninja').ult = 100
    expect(Array.from({ length: 30 }, () => step(high)).flat().some((event) => event.t === 'ultimate' && event.skillId === 'mijin')).toBe(true)
  })
  it('10ウェーブ目のボスは金棒振りを使う', () => {
    const world = createWorld({ stageNo: 20 }); world.wave = 10
    for (let count = 0; world.phase !== 'battle' && count < 2000; count++) step(world)
    const boss = foes(world).find((unit) => unit.defId === 'ooni')!
    for (const foe of foes(world)) if (foe !== boss) { foe.hp = 0 }
    boss.x = 14
    const events = Array.from({ length: 40 }, () => step(world)).flat()
    expect(events.some((event) => event.t === 'skill' && event.skillId === 'kanabo')).toBe(true)
  })
})

describe('育成と進行（M4の一部）', () => {
  it('経験値が境目を超えるとLvが上がる', () => {
    const profile = newProfile('t')
    const out = applyRewards(profile, [{ t: 'reward', koban: 5, exp: expToNext(1), enemyId: 'chochin', x: 0 }])
    expect(profile.party.members.samurai.lv).toBe(2)
    expect(out.events.filter((event) => event.t === 'levelUp').map(event => event.t === 'levelUp' ? event.job : '')).toEqual(deployedJobs(profile.party.order))
    expect(profile.koban).toBe(5); expect(profile.stats.kills).toBe(1); expect(profile.seenEnemies).toEqual(['chochin'])
  })
  it('道場：値段は1.5倍ずつ、小判が足りなければ買えない', () => {
    const profile = newProfile('t')
    expect(dojoCost('atk', 0)).toBe(100); expect(dojoCost('atk', 2)).toBe(225)
    expect(buyDojo(profile, 'atk').ok).toBe(false)
    profile.koban = 100
    expect(buyDojo(profile, 'atk')).toEqual({ ok: true }); expect(profile.koban).toBe(0); expect(profile.dojo.atk).toBe(1)
  })
  it('オフライン報酬：直近の平均×0.5、上限8時間、受け取りは1回だけ', () => {
    const profile = newProfile('t')
    profile.rates.minutes = [{ koban: 10, exp: 20 }, { koban: 30, exp: 40 }]
    expect(computeOffline(profile, 30 * 1000)).toBeNull()
    const capped = computeOffline(profile, 24 * 3600 * 1000)!
    expect(capped.ms).toBe(8 * 3600 * 1000); expect(capped.koban).toBe(20 * 480 * 0.5)
    addOffline(profile, capped)
    claimOffline(profile)
    expect(profile.koban).toBe(capped.koban)
    expect(claimOffline(profile)).toEqual([]); expect(profile.koban).toBe(capped.koban)
  })
  it('3回続けて全滅すると、ひとつ前のステージへ戻って周回する', () => {
    const profile = newProfile('t'); profile.progress.unlockedStage = 3; profile.progress.currentStage = 3
    const game = createGame(profile, 1)
    for (let wipe = 0; wipe < b.wipeLoopThreshold; wipe++) {
      for (let count = 0; game.world.phase !== 'battle' && count < 2000; count++) advance(game)
      for (const unit of game.world.units) if (unit.side === 'ally') unit.hp = 0
      advance(game)
      for (let count = 0; game.world.phase !== 'walking' && count < 2000; count++) advance(game)
    }
    expect(game.world.loop).toBe(true); expect(game.world.stageNo).toBe(2)
  })
  it('解放していないステージは選べない', () => {
    const game = createGame(newProfile('t'), 1)
    expect(runCommand(game, { c: 'selectStage', stageNo: 3 }).ok).toBe(false)
    expect(runCommand(game, { c: 'setLoop', loop: true })).toEqual({ ok: true }); expect(game.world.loop).toBe(true)
  })
  it.each([
    { alreadyAutoLooping: false, depthRank: 0 as const }, { alreadyAutoLooping: true, depthRank: 0 as const },
    { alreadyAutoLooping: false, depthRank: 1 as const }, { alreadyAutoLooping: true, depthRank: 1 as const },
  ])('全滅時の自動後退は明示した移動予約を上書きしない: %j', ({ alreadyAutoLooping, depthRank }) => {
    const profile = newProfile('t')
    profile.progress.currentStage = 30; profile.progress.unlockedStage = 100; profile.progress.unlockedDepths = [100, 30, 0]
    const game = createGame(profile, 1)
    for (let count = 0; game.world.phase !== 'battle' && count < 2000; count++) advance(game)
    expect(game.world.phase).toBe('battle')
    game.world.wipeStreak = b.wipeLoopThreshold - 1
    game.world.loop = alreadyAutoLooping
    expect(runCommand(game, { c: 'selectStage', stageNo: 25, depthRank })).toEqual({ ok: true })
    for (const unit of game.world.units) if (unit.side === 'ally') unit.hp = 0
    const result = advance(game)
    expect(result.events.some(event => event.t === 'phase' && event.phase === 'wipe')).toBe(true)
    expect(game.world.pending.stageNo).toBe(25)
    expect(game.world.pending.depthRank).toBe(depthRank)
    expect(game.world.loop).toBe(false)
    for (let count = 0; game.world.phase !== 'walking' && count < 2000; count++) advance(game)
    expect(game.world.phase).toBe('walking')
    expect(game.world.stageNo).toBe(25); expect(game.world.depthRank).toBe(depthRank)
    expect(game.profile.progress.currentStage).toBe(25); expect(game.profile.progress.depthRank).toBe(depthRank)
    expect(game.world.loop).toBe(profile.progress.loop)
    expect(game.world.pending.stageNo).toBeUndefined()
  })
  it('手動周回ONの場合は全滅後の予約先でも周回設定を保持する', () => {
    const profile = newProfile('t'); profile.progress.currentStage = 30; profile.progress.unlockedStage = 30; profile.progress.unlockedDepths = [30, 0, 0]
    const game = createGame(profile, 1)
    runCommand(game, { c: 'setLoop', loop: true })
    for (let count = 0; game.world.phase !== 'battle' && count < 2000; count++) advance(game)
    game.world.wipeStreak = b.wipeLoopThreshold - 1
    runCommand(game, { c: 'selectStage', stageNo: 25 })
    for (const unit of game.world.units) if (unit.side === 'ally') unit.hp = 0
    advance(game)
    for (let count = 0; game.world.phase !== 'walking' && count < 2000; count++) advance(game)
    expect(game.world.stageNo).toBe(25)
    expect(game.world.loop).toBe(true); expect(profile.progress.loop).toBe(true)
  })
  it.each(['walking', 'battle', 'wipe', 'stageClear'] as const)('現在地の再指定は%s中の進行を巻き戻さない', phase => {
    const profile = newProfile('t'); profile.progress.currentStage = 30; profile.progress.unlockedStage = 30; profile.progress.unlockedDepths = [30, 0, 0]
    const game = createGame(profile, 1)
    game.world.phase = phase; game.world.wave = 7; game.world.phaseUntilTick = 99
    game.autoFarmClears = 2
    const before = { world: structuredClone(game.world), profile: structuredClone(profile), autoFarmClears: game.autoFarmClears }
    expect(runCommand(game, { c: 'selectStage', stageNo: 30, depthRank: 0 })).toEqual({ ok: true })
    expect({ world: game.world, profile, autoFarmClears: game.autoFarmClears }).toEqual(before)
  })
  it('街から同じ階へは出発でき、同階でも違う難度へは予約できる', () => {
    const profile = newProfile('t'); profile.progress.currentStage = 30; profile.progress.unlockedStage = 100; profile.progress.unlockedDepths = [100, 30, 0]
    const game = createGame(profile, 1)
    runCommand(game, { c: 'returnTown' })
    expect(runCommand(game, { c: 'selectStage', stageNo: 30, depthRank: 0 })).toEqual({ ok: true })
    expect(game.world.phase).toBe('walking'); expect(profile.progress.inTown).toBe(false)
    game.world.phase = 'battle'; game.world.wave = 7
    expect(runCommand(game, { c: 'selectStage', stageNo: 30, depthRank: 1 })).toEqual({ ok: true })
    expect(game.world.pending).toMatchObject({ stageNo: 30, depthRank: 1 })
    expect(game.world.wave).toBe(7)
  })
})

describe('セーブ', () => {
  let dir = ''
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = '' })
  const paths = () => ({ save: join(dir, 'save.json'), previousSave: join(dir, 'save.prev.json'), brokenSave: join(dir, 'save.broken.json'), settings: join(dir, 'settings.json') })
  it('保存→読み込みで状態が戻り、前の世代がprevに残る', () => {
    dir = mkdtempSync(join(tmpdir(), 'hyakki-'))
    const profile = newProfile('t'); profile.koban = 42
    saveProfile(paths(), profile); profile.koban = 43; saveProfile(paths(), profile)
    expect(loadProfile(paths()).profile.koban).toBe(43)
    expect(JSON.parse(readFileSync(paths().previousSave, 'utf8')).koban).toBe(42)
  })
  it('壊れたセーブはprevから復旧し、壊れたファイルを1つだけ残す', () => {
    dir = mkdtempSync(join(tmpdir(), 'hyakki-'))
    const profile = newProfile('t'); profile.koban = 7
    saveProfile(paths(), profile); saveProfile(paths(), profile)
    writeFileSync(paths().save, '{"version":1,"koban":')
    const loaded = loadProfile(paths())
    expect(loaded.source).toBe('prev'); expect(loaded.profile.koban).toBe(7)
    expect(existsSync(paths().brokenSave)).toBe(true)
    writeFileSync(paths().previousSave, 'null')
    expect(() => loadProfile(paths())).toThrow('セーブを安全に')
  })
  it('NaNや範囲外の値は検証で拒否する', () => {
    const profile = newProfile('t')
    expect(() => validateProfile({ ...profile, koban: Number.NaN })).toThrow()
    expect(() => validateProfile({ ...profile, party: { ...profile.party, members: { ...profile.party.members, ninja: { lv: 99, exp: 0 } } } })).toThrow()
    expect(validateProfile(JSON.parse(JSON.stringify(profile))).koban).toBe(0)
  })
})
