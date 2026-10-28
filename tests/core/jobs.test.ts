import { describe, expect, it } from 'vitest'
import { createWorld, defaultFormation, jobs, roleLabels, newProfile, partyOrder, requestOrder, step, validateProfile, type JobId, type SimEvent, type World } from '../../src/core/index.ts'
import { gearWeights, itemBalance, weaponNames } from '../../src/core/data/items.ts'
import { addEffect, kobanMul, strike } from '../../src/core/sim/actions.ts'
import { chooseTarget } from '../../src/core/sim/combat.ts'
import { onBattleStart, refreshStats, skills, ultimates } from '../../src/core/sim/skills.ts'
import { rollItem, scoreDelta } from '../../src/core/progress/items.ts'

function fixture(job: JobId) {
  const world = createWorld({ level: 10, order: [job, ...partyOrder.filter((id) => id !== job)] })
  for (let tick = 0; world.phase !== 'battle' && tick < 2000; tick++) step(world)
  expect(world.phase).toBe('battle')
  world.mines = []; world.projectiles = []
  for (const unit of world.units) {
    unit.effects = []; unit.action = { kind: 'none', untilTick: 0 }; unit.attackReadyTick = unit.skillReadyTick = world.tick + 10000
    unit.hp = unit.stats.maxHp = unit.base.maxHp = 10000
    if (unit.side === 'enemy') { unit.x = 14; unit.base.atk = 100; unit.base.eva = 0 }
    refreshStats(world, unit)
  }
  return { world, self: world.units[0], enemy: world.units.find((unit) => unit.side === 'enemy')!, events: [] as SimEvent[] }
}
const refreshAll = (world: World) => world.units.forEach((unit) => refreshStats(world, unit))

describe('全17ジョブの実装', () => {
  it.each(partyOrder)('%sの通常攻撃・スキル・奥義・装備データが利用できる', (job) => {
    const ctx = fixture(job), def = jobs[job]
    ctx.self.hp = 5000
    expect(gearWeights[job]).toBeDefined()
    expect(weaponNames[job].length).toBeGreaterThan(0)
    expect(itemBalance.jobAtkMul[job]).toBeGreaterThan(0)
    const item = rollItem({ rng: 1 }, 't', { ilvl: 1, jobs: [job], luk: 0 })
    expect(Number.isFinite(scoreDelta(newProfile('t'), job, item))).toBe(true)
    expect(skills[def.skill.id].canUse(ctx)).toBe(true)
    skills[def.skill.id].use(ctx)
    expect(ultimates[def.ultimate.id]).toBeTypeOf('function')
    ultimates[def.ultimate.id](ctx, 7)
    expect(ctx.events.length + ctx.world.mines.length).toBeGreaterThan(0)
    // The normal simulation also dispatches this job's ultimate after its cast.
    ctx.self.action = { kind: 'none', untilTick: 0 }; ctx.self.ult = 100
    const events = Array.from({ length: 10 }, () => step(ctx.world)).flat()
    expect(events.some((event) => event.t === 'ultimate' && event.uid === ctx.self.uid && event.skillId === def.ultimate.id)).toBe(true)
    expect(ctx.world.units.every((unit) => Number.isFinite(unit.hp))).toBe(true)
    ctx.self.effects = []; ctx.self.action = { kind: 'none', untilTick: 0 }; ctx.self.attackReadyTick = ctx.world.tick; ctx.self.ult = 0
    ctx.world.projectiles = []; ctx.world.mines = []
    for (const enemy of ctx.world.units.filter((unit) => unit.side === 'enemy')) enemy.x = 14
    const normal = Array.from({ length: 10 }, () => step(ctx.world)).flat()
    expect(normal.some((event) => event.t === 'attack' && event.uid === ctx.self.uid)).toBe(true)
    expect(normal.some((event) => event.t === 'damage' && event.sourceUid === ctx.self.uid)).toBe(true)
  })
  it('巫女の結界は弱体だけを消し、全体回復・被ダメ軽減を与える', () => {
    const ctx = fixture('miko'), target = ctx.world.units[1]
    target.hp = 5000
    addEffect(target, { kind: 'atkPct', tag: 'curse', value: -0.2, untilTick: 99999, sourceUid: ctx.enemy.uid }, ctx.events)
    addEffect(target, { kind: 'atkPct', tag: 'buff', value: 0.1, untilTick: 99999, sourceUid: ctx.self.uid }, ctx.events)
    skills.kekkai.use(ctx); refreshAll(ctx.world)
    expect(target.hp).toBeGreaterThan(5000)
    expect(target.effects.some((effect) => effect.tag === 'curse')).toBe(false)
    expect(target.effects.some((effect) => effect.tag === 'buff')).toBe(true)
    expect(target.stats.dmgTakenMul).toBeCloseTo(0.8)
    onBattleStart(ctx.world, ctx.events); refreshAll(ctx.world)
    expect(target.stats.dmgTakenMul).toBeLessThan(0.8)
  })
  it('番長の挑発は射程内の敵の標的になり、被弾を軽減して反撃する', () => {
    const ctx = fixture('bancho')
    skills.tanka.use(ctx); refreshAll(ctx.world)
    ctx.enemy.stats.rangeDots = 200
    expect(chooseTarget(ctx.world, ctx.enemy)).toBe(ctx.self)
    expect(ctx.self.stats.dmgTakenMul).toBeCloseTo(0.75)
    strike(ctx.world, ctx.enemy, ctx.self, { mul: 1, aoeDots: 1 }, ctx.events)
    expect(ctx.events.some((event) => event.t === 'damage' && event.tags?.includes('counter') && event.sourceUid === ctx.self.uid)).toBe(true)
  })
  it('ギャルの撮影で敵の被ダメージが増え、奥義で仲間の攻撃が速くなる', () => {
    const ctx = fixture('gyaru')
    skills.decosnap.use(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.stats.dmgTakenMul).toBeCloseTo(1.2)
    ultimates.buzzlive(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.stats.dmgTakenMul).toBeCloseTo(1.3)
    expect(ctx.self.stats.intervalMs).toBeLessThan(ctx.self.base.intervalMs)
    onBattleStart(ctx.world, ctx.events); refreshAll(ctx.world)
    expect(ctx.self.stats.atk).toBeGreaterThan(ctx.self.base.atk)
  })
  it('スケバンの威圧が敵の攻撃を下げ、瀕死の敵への追撃が強い', () => {
    const ctx = fixture('sukeban')
    skills.ikaku.use(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.stats.atk).toBeCloseTo(ctx.enemy.base.atk * 0.8)
    const damageAt = (ratio: number) => {
      ctx.enemy.hp = ctx.enemy.stats.maxHp * ratio; ctx.world.rng = 9
      const events: SimEvent[] = []; strike(ctx.world, ctx.self, ctx.enemy, { mul: 1, aoeDots: 1 }, events)
      return events.find((event): event is Extract<SimEvent, { t: 'damage' }> => event.t === 'damage')!.amount
    }
    expect(damageAt(0.3)).toBeGreaterThan(damageAt(1))
  })
  it('農民は頑丈さより竹槍の間合いと逃げ腰の回避に長所がある', () => {
    const ctx = fixture('farmer')
    const original = ctx.enemy
    for (let index = 0; index < 2; index++) ctx.world.units.push({ ...original, uid: ctx.world.nextId++, x: 24 + index * 10, effects: [], stats: { ...original.stats }, base: { ...original.base } })
    skills.kushizashi.use(ctx)
    expect(ctx.events.filter((event) => event.t === 'damage' && event.tags?.includes('kushizashi'))).toHaveLength(3)
    expect(ctx.self.stats.eva).toBeCloseTo(ctx.self.base.eva + jobs.farmer.passive.params.eva)
    expect(jobs.farmer.base.maxHp).toBeLessThan(jobs.samurai.base.maxHp)
    expect(jobs.farmer.base.def).toBeLessThan(jobs.samurai.base.def)
  })
  it('メイドは低耐久の高速ナイフ連撃で戦い、軽減反撃を行わない', () => {
    const ctx = fixture('maid')
    skills.knifevolley.use(ctx)
    expect(ctx.events.filter((event) => event.t === 'damage' && event.tags?.includes('knifevolley'))).toHaveLength(3)
    expect(ctx.self.stats.intervalMs).toBeLessThan(ctx.self.base.intervalMs)
    ultimates.knifecurtain(ctx); refreshAll(ctx.world)
    expect(ctx.self.stats.intervalMs).toBeCloseTo(ctx.self.base.intervalMs * 0.9 * 0.7)
    expect(ctx.self.stats.dmgTakenMul).toBe(1)
    expect(jobs.maid.base.maxHp).toBeLessThan(jobs.samurai.base.maxHp)
    expect(jobs.maid.base.def).toBeLessThan(jobs.samurai.base.def)
    strike(ctx.world, ctx.enemy, ctx.self, { mul: 1, aoeDots: 1 }, ctx.events)
    expect(ctx.events.some((event) => event.t === 'damage' && event.tags?.includes('counter'))).toBe(false)
  })
  it('キョンシーは1戦に1回だけ復活し、次の戦闘で再び使用できる', () => {
    const ctx = fixture('jiangshi')
    ctx.self.hp = 0
    expect(step(ctx.world).some((event) => event.t === 'revive' && event.uid === ctx.self.uid)).toBe(true)
    expect(ctx.self.hp).toBeCloseTo(ctx.self.stats.maxHp * 0.3)
    ctx.self.hp = 0; step(ctx.world)
    expect(ctx.self.alive).toBe(false)
    for (const unit of ctx.world.units) if (unit.side === 'enemy') unit.hp = 0
    step(ctx.world)
    ctx.world.phaseUntilTick = ctx.world.tick
    step(ctx.world)
    expect(ctx.self.gauges.raised).toBeUndefined()
    for (let tick = 0; ctx.world.phase !== 'battle' && tick < 2000; tick++) step(ctx.world)
    ctx.self.hp = 0
    step(ctx.world)
    expect(ctx.self.alive).toBe(true)
    expect(ctx.self.gauges.raised).toBe(1)
  })
  it('ホームレスは低耐久の道具投げで敵を妨害し、小判を回収する', () => {
    const ctx = fixture('vagabond')
    expect(kobanMul(ctx.world)).toBeCloseTo(1.1)
    skills.salvage.use(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.stats.atk).toBeCloseTo(ctx.enemy.base.atk * 0.85)
    expect(kobanMul(ctx.world)).toBeCloseTo(1.25)
    ultimates.junkstorm(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.stats.atk).toBeCloseTo(ctx.enemy.base.atk * 0.75)
    expect(kobanMul(ctx.world)).toBeCloseTo(1.4)
    expect(ctx.self.stats.dmgTakenMul).toBe(1)
    expect(jobs.vagabond.base.maxHp).toBeLessThan(jobs.samurai.base.maxHp)
    expect(jobs.vagabond.base.def).toBeLessThan(jobs.samurai.base.def)
    expect(jobs.vagabond.attack.projectile).toBe('junk')
  })
  it('力士は高耐久低速で、張り手が敵を実際に押し戻す', () => {
    const ctx = fixture('rikishi'), before = ctx.enemy.x
    skills.harite.use(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.x).toBe(before + jobs.rikishi.skill.params.push)
    expect(ctx.self.stats.dmgTakenMul).toBeCloseTo(0.8 * 0.85)
    const skillX = ctx.enemy.x
    ultimates.ooichiban(ctx)
    expect(ctx.enemy.x).toBe(skillX + jobs.rikishi.ultimate.params.push)
    expect(jobs.rikishi.base.maxHp).toBeGreaterThan(jobs.bancho.base.maxHp)
    expect(jobs.rikishi.base.intervalMs).toBeGreaterThan(jobs.bancho.base.intervalMs)
    expect(ctx.events.some((event) => event.t === 'damage' && event.tags?.includes('counter'))).toBe(false)
  })
  it('シスターは回復し、仲間の致命傷をHP1で1戦に1回だけ防ぐ', () => {
    const ctx = fixture('sister'), target = ctx.world.units[1]
    target.hp = 1000
    skills.prayer.use(ctx)
    expect(target.hp).toBeGreaterThan(1000)
    onBattleStart(ctx.world, ctx.events)
    target.hp = 10
    strike(ctx.world, ctx.enemy, target, { mul: 1000, aoeDots: 1 }, ctx.events)
    expect(target.hp).toBe(1)
    expect(target.gauges.wardUsed).toBe(1)
    expect(ctx.events.some((event) => event.t === 'death' || event.t === 'revive')).toBe(false)
    strike(ctx.world, ctx.enemy, target, { mul: 1000, aoeDots: 1 }, ctx.events)
    expect(target.hp).toBe(1)
    target.effects = target.effects.filter((effect) => effect.kind !== 'invuln')
    strike(ctx.world, ctx.enemy, target, { mul: 1000, aoeDots: 1 }, ctx.events)
    expect(target.hp).toBe(0)
    step(ctx.world)
    expect(target.alive).toBe(false)
    for (const enemy of ctx.world.units.filter((unit) => unit.side === 'enemy')) enemy.hp = 0
    step(ctx.world)
    ctx.world.phaseUntilTick = ctx.world.tick; step(ctx.world)
    expect(target.gauges.wardUsed).toBeUndefined()
    for (let tick = 0; ctx.world.phase !== 'battle' && tick < 2000; tick++) step(ctx.world)
    expect(target.effects.some((effect) => effect.kind === 'deathWard')).toBe(true)
    target.hp = 10
    const nextEnemy = ctx.world.units.find((unit) => unit.side === 'enemy' && unit.hp > 0)!
    strike(ctx.world, nextEnemy, target, { mul: 1000, aoeDots: 1 }, ctx.events)
    expect(target.hp).toBe(1)
    expect(target.gauges.wardUsed).toBe(1)
  })
  it('シスターが控えなら守護を付与せず、巫女の解除とは役割が違う', () => {
    const world = createWorld({ level: 10 }), events: SimEvent[] = []
    onBattleStart(world, events)
    expect(world.units.some((unit) => unit.effects.some((effect) => effect.kind === 'deathWard'))).toBe(false)
    expect(jobs.miko.role).toBe('healer'); expect(jobs.sister.role).toBe('healer')
    expect(jobs.bancho.role).toBe('tank'); expect(jobs.rikishi.role).toBe('tank')
    expect(partyOrder.filter((job) => jobs[job].role === 'tank')).toEqual(['bancho', 'rikishi'])
    expect(partyOrder.every((job) => roleLabels[jobs[job].role])).toBe(true)
  })
  it('殿の妙な采配は確定で味方を強化し、費用や味方弱体を発生させない', () => {
    const ctx = fixture('tono')
    skills.saihai.use(ctx); refreshAll(ctx.world)
    for (const target of ctx.world.units.filter((unit) => unit.side === 'ally')) expect(target.stats.atk).toBeCloseTo(target.base.atk * 1.15)
    onBattleStart(ctx.world, ctx.events); refreshAll(ctx.world)
    expect(ctx.self.stats.intervalMs).toBeCloseTo(ctx.self.base.intervalMs * 0.95)
    ultimates.onari(ctx); refreshAll(ctx.world)
    expect(ctx.self.stats.atk).toBeCloseTo(ctx.self.base.atk * 1.4)
    expect(ctx.self.stats.intervalMs).toBeCloseTo(ctx.self.base.intervalMs * 0.75)
    expect(ctx.events.some((event) => event.t === 'reward')).toBe(false)
    expect(ctx.self.effects.filter((effect) => effect.kind === 'atkPct').every((effect) => effect.value > 0)).toBe(true)
    expect(jobs.tono.role).toBe('buffer')
  })
  it('ガリ勉の難問は敵を遅らせ、分析と解答が味方の会心を支援する', () => {
    const ctx = fixture('gariben')
    skills.nanmon.use(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.stats.intervalMs).toBeCloseTo(ctx.enemy.base.intervalMs * 1.25)
    onBattleStart(ctx.world, ctx.events); refreshAll(ctx.world)
    expect(ctx.enemy.stats.dmgTakenMul).toBeCloseTo(1.08)
    ultimates.tetsuya(ctx); refreshAll(ctx.world)
    expect(ctx.enemy.stats.intervalMs).toBeCloseTo(ctx.enemy.base.intervalMs * 1.65)
    expect(ctx.self.stats.cri).toBeCloseTo(ctx.self.base.cri + 0.1)
    expect(ctx.self.stats.dmgTakenMul).toBe(1)
    expect(jobs.gariben.base.maxHp).toBeLessThan(jobs.samurai.base.maxHp)
    expect(jobs.gariben.base.def).toBeLessThan(jobs.samurai.base.def)
    const counts = Object.fromEntries(Object.keys(roleLabels).map((role) => [role, partyOrder.filter((job) => jobs[job].role === role).length]))
    expect(counts).toEqual({ attacker: 7, tank: 2, healer: 2, buffer: 3, debuffer: 3 })
  })
  it('17名から新12名を含む3名を選び、残り14名を控えに置く', () => {
    const world = createWorld()
    requestOrder(world, ['farmer', 'maid', 'jiangshi', ...partyOrder.filter((job) => !['farmer', 'maid', 'jiangshi'].includes(job))])
    expect(world.units.map((unit) => unit.defId)).toEqual(['farmer', 'maid', 'jiangshi'])
    expect(world.reserves).toHaveLength(14)
    expect(new Set([...world.units, ...world.reserves].map((unit) => unit.defId)).size).toBe(17)
  })
  it('v2の5人順序・育成・装備を保持して新12名だけをLv1で追加する', () => {
    const profile = newProfile('t')
    const oldJobs = ['pachipro', 'otaku', 'jirai', 'ninja', 'samurai'] as JobId[]
    profile.version = 2; profile.party.order = oldJobs
    for (const job of partyOrder.filter((job) => !oldJobs.includes(job))) delete (profile.party.members as Partial<typeof profile.party.members>)[job]
    profile.party.members.ninja.lv = 17
    profile.inventory.push({ id: 'i1', slot: 'weapon', job: 'ninja', ilvl: 5, rarity: 1, name: '八方手裏剣', locked: true, isNew: false, atk: 10, hp: 0, def: 0, affixes: [] })
    profile.party.members.ninja.equip.weapon = 'i1'; profile.nextItemId = 2
    const restored = validateProfile(JSON.parse(JSON.stringify(profile)))
    expect(restored.version).toBe(3)
    expect(restored.party.order).toEqual([...oldJobs, ...partyOrder.slice(5)])
    expect(restored.party.members.ninja.lv).toBe(17)
    expect(restored.party.members.ninja.equip.weapon).toBe('i1')
    expect(restored.inventory).toMatchObject(profile.inventory)
    expect(partyOrder.slice(5).every((job) => restored.party.members[job].lv === 1)).toBe(true)
    expect(validateProfile({ ...profile, version: 1 }).party.order).toEqual(restored.party.order)
    expect(newProfile('t').party.order).toEqual(defaultFormation)
  })
})
